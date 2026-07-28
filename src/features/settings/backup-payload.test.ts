import { describe, it, expect, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { currencies, ensureCurrenciesTable } from '@features/currencies/schema';
import { listCurrencies } from '@features/currencies/queries';
import { ensureSettingsTable } from './schema';
import { restoreEntries } from '@features/entries/queries';
import { parseCatalogJson } from './catalog';
import { buildBackupText } from './backup-payload';

const ENTRY = {
  date: '2026-07-15',
  account: 'Cash',
  category: 'Coffee',
  amount: -12000,
  currency: 'THB',
  description: '',
} as const;

describe('buildBackupText', () => {
  beforeEach(async () => {
    // fresh db per test
  });

  it('builds a v4 combined backup with the whole ledger and correct counts', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    await ensureBudgetsTable(db);
    await ensureCurrenciesTable(db);
    await ensureSettingsTable(db);
    await restoreEntries(db, [ENTRY]);
    await listCurrencies(db); // simulate the currency page having been opened at least once (seeds it)

    const payload = await buildBackupText(db);
    expect(payload.entryCount).toBe(1);
    const parsed = parseCatalogJson(payload.text);
    if (parsed === null) throw new Error('expected a valid v4 backup');
    expect(parsed.version).toBe(4);
    expect(parsed.entriesCsv).toContain('Coffee');
    expect(parsed.currencies?.map((c) => c.code)).toContain('THB');
  });

  // getCurrencyCatalog reads the currencies table directly rather than routing through
  // listAllCurrencies, specifically so a backup export never seeds the nine default currencies as a
  // side effect on a device that never opened the currency page — "exporting a backup writes to the
  // ledger DB" is a surprising property for the app's most consequential code path.
  it('does not seed the currency table as a side effect of exporting a backup', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    await ensureBudgetsTable(db);
    await ensureCurrenciesTable(db);
    await ensureSettingsTable(db);

    const payload = await buildBackupText(db);

    const parsed = parseCatalogJson(payload.text);
    if (parsed === null) throw new Error('expected a valid v4 backup');
    expect(parsed.currencies).toEqual([]); // nothing to report — the table was never seeded
    expect(await db.select().from(currencies).all()).toEqual([]); // and the export left it that way
  });
});
