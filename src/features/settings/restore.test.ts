import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { ensureSettingsTable } from './schema';
import { getEntries, restoreEntries } from '@features/entries/queries';
import { getBudgets, setBudget } from '@features/budgets/queries';
import { getTravelCurrencies } from '@features/currencies/queries';
import { recurrences } from '@features/recurring/schema';
import { getCutoff, getFontScale } from './queries';
import type { CatalogData } from './catalog';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { restoreBackupAction } from './restore';

const HEADER = 'date,account,category,amount,currency,converted amount,currency,description\n';

const CSV = HEADER + '15/01/2016,Cash,Food,-500,THB,-500,THB,lunch';

function combined(over: Partial<CatalogData> = {}): CatalogData {
  return {
    version: 3,
    categories: [],
    accounts: [],
    recurrences: [],
    entriesCsv: CSV,
    budgets: [{ category: 'Food', amount: 5000 }],
    settings: [
      { key: 'cutoff_day', value: '9' },
      { key: 'font_scale', value: 'lg' },
    ],
    ...over,
  };
}

describe('restoreBackupAction', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    await ensureBudgetsTable(db);
    await ensureCurrenciesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('a v3 combined backup replaces the ledger and restores budgets + settings', async () => {
    const db = await getBrowserDb();
    // Pre-existing state the restore should overwrite (entries) or merge over (budget/setting).
    await restoreEntries(db, [
      { date: '2020-01-01', account: 'Old', category: 'Old', amount: -1, currency: 'THB' },
      { date: '2020-01-02', account: 'Old', category: 'Old', amount: -2, currency: 'THB' },
    ]);

    const summary = await restoreBackupAction(combined());

    expect(summary).toEqual({ entries: 1, categories: 0, accounts: 0, budgets: 1 });
    // Entries were REPLACED, not appended — the two old rows are gone, only the CSV's one remains.
    const entries = await getEntries(db);
    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('Food');
    // Budget MERGED in, keyed by category name.
    const budgets = await getBudgets(db);
    expect(budgets.find((b) => b.category === 'Food')?.amount).toBe(5000);
    // Settings MERGED in — both KV rows applied.
    expect(await getCutoff(db)).toBe(9);
    expect(await getFontScale(db)).toBe('lg');
  });

  it('leaves budgets the file omits untouched (merge, not replace)', async () => {
    const db = await getBrowserDb();
    await setBudget(db, 'Rent', 12000); // not in the backup below

    await restoreBackupAction(combined({ budgets: [{ category: 'Food', amount: 5000 }] }));

    const budgets = await getBudgets(db);
    expect(budgets.find((b) => b.category === 'Rent')?.amount).toBe(12000); // survived
    expect(budgets.find((b) => b.category === 'Food')?.amount).toBe(5000); // added
  });

  // A v3 export ALWAYS carries an entriesCsv (use-backup-data serializes one even for an empty
  // ledger), so a header-only CSV is a normal artifact, not a corrupt file. Restoring it clears the
  // ledger — and must rewind the rules with it, or a rule keeps claiming it posted through a date
  // whose entries no longer exist and the sweep never refills the gap.
  //
  // The rewind target is null, NOT '': paidCount() branches on `lastPosted === null` and then does
  // month arithmetic on the string, so '' would slip past the guard and yield NaN.
  it('rewinds recurring rules to null when the backup clears the ledger', async () => {
    const db = await getBrowserDb();
    await db
      .insert(recurrences)
      .values({
        name: 'Netflix',
        day: 5,
        intervalMonths: 1,
        accountId: null,
        categoryId: null,
        amount: 9.99,
        currency: null,
        rate: null,
        totalCount: null,
        startSeq: 1,
        startDate: '2026-01-05',
        lastPosted: '2026-07-05',
      })
      .run();

    const summary = await restoreBackupAction(combined({ entriesCsv: HEADER }));

    expect(summary.entries).toBe(0);
    expect(await getEntries(db)).toHaveLength(0); // ledger cleared to match the backup
    const rules = await db.select().from(recurrences).all();
    expect(rules[0].lastPosted).toBeNull(); // rewound, so the next sweep refills from startDate
  });

  // USD is not off-budget in the seed defaults (see SEED_CURRENCIES), so this only passes if the
  // restore actually applied the flag from the file — a currency the seed already marks off-budget
  // (JPY) would pass even if restoreCurrencyCatalog were never called.
  it('restores the currency catalog so off-budget currencies are recognised', async () => {
    const db = await getBrowserDb();

    await restoreBackupAction(
      combined({ currencies: [{ code: 'USD', offBudget: true, sortOrder: 5, archived: false }] }),
    );

    expect(await getTravelCurrencies(db)).toContain('USD');
  });

  // Restore shares parseMonefyCsv with the legacy Monefy importer, which drops positive-amount rows
  // on purpose (income categories). A refund is a positive-amount row under the same category as the
  // expense it refunds, so a naive shared parse call silently deletes every refund on restore — the
  // off_budget v1.8.1 defect class, which only bites on a fresh device restore.
  it('keeps a refund (positive-amount row) through restore', async () => {
    const db = await getBrowserDb();
    const csvWithRefund =
      HEADER +
      '15/01/2016,Card,Food,-2000,THB,-2000,THB,lunch\n' +
      '16/01/2016,Cash,Food,500,THB,500,THB,refund';

    const summary = await restoreBackupAction(combined({ entriesCsv: csvWithRefund }));

    expect(summary.entries).toBe(2);
    const entries = await getEntries(db);
    expect(entries.map((e) => e.amount)).toEqual([-2000, 500]);
  });

  it('a catalog-only file (no entriesCsv/budgets/settings) leaves the ledger untouched', async () => {
    const db = await getBrowserDb();
    await restoreEntries(db, [
      { date: '2020-01-01', account: 'Old', category: 'Old', amount: -1, currency: 'THB' },
    ]);

    const summary = await restoreBackupAction({
      version: 2,
      categories: [{ name: 'New', emoji: '🆕', hue: null, sortOrder: null, archived: false }],
      accounts: [],
      recurrences: [],
    });

    expect(summary).toEqual({ entries: null, categories: 1, accounts: 0, budgets: 0 });
    expect(await getEntries(db)).toHaveLength(1); // ledger not touched
  });
});
