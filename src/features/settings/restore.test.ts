import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from './schema';
import { getEntries, restoreEntries } from '@features/entries/queries';
import { getBudgets, setBudget } from '@features/budgets/queries';
import { getCutoff, getFontScale } from './queries';
import type { CatalogData } from './catalog';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { restoreBackupAction } from './restore';

const CSV =
  'date,account,category,amount,currency,converted amount,currency,description\n' +
  '15/01/2016,Cash,Food,-500,THB,-500,THB,lunch';

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
