import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { addEntries, getEntries } from './queries';
import { setCurrencyArchived } from '@features/currencies/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { editEntryAction } from './actions';

let db: Db;

beforeEach(async () => {
  db = makeNodeProxyDb();
  await ensureEntriesTable(db);
  await ensureCurrenciesTable(db);
  vi.mocked(getBrowserDb).mockResolvedValue(db);
});

// Root-cause coverage for the currency-archive data-loss fix: recognising an archived-currency entry
// correctly (use-edit-entry.ts) means the Keypad now resubmits that entry's own currency unchanged on
// save. Write-time validation (getCurrencyCodes, non-archived — unchanged, still gates NEW entries and
// switching to a different archived currency) must not then reject that resubmission, or an archived
// currency would lock every one of its existing entries out of being edited at all.
describe('editEntryAction — archived currencies', () => {
  it('keeps an existing entry saveable in its own currency after that currency is archived', async () => {
    await setCurrencyArchived(db, 'JPY', true);
    await addEntries(db, [
      {
        date: '2026-07-03',
        account: 'Cash',
        category: 'Trip',
        amount: -1000,
        currency: 'JPY',
        originalAmount: -10000,
      },
    ]);
    const entry = (await getEntries(db)).find((e) => e.currency === 'JPY');
    if (entry === undefined) throw new Error('seed missing the JPY entry');

    const fd = new FormData();
    fd.set('id', String(entry.id));
    fd.set('account', entry.account);
    fd.set('category', entry.category);
    fd.set('date', entry.date);
    fd.set('currency', 'JPY');
    fd.set('amount', String(Math.abs(entry.originalAmount ?? 0)));
    fd.set('thb', String(Math.abs(entry.amount)));

    await expect(editEntryAction(fd)).resolves.toBeUndefined();

    const saved = await getEntries(db);
    const updated = saved.find((e) => e.id === entry.id);
    expect(updated?.currency).toBe('JPY');
    expect(updated?.originalAmount).toBe(-10000);
  });

  it('still rejects a NEW entry submitted in an archived currency', async () => {
    await setCurrencyArchived(db, 'JPY', true);
    await addEntries(db, [{ date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 }]);
    const [existing] = await getEntries(db);

    const fd = new FormData();
    fd.set('id', String(existing.id));
    fd.set('account', 'Cash');
    fd.set('category', 'Food');
    fd.set('date', '2026-07-04');
    fd.set('currency', 'JPY'); // this entry was never JPY — a genuine switch, not a resubmission
    fd.set('amount', '1000');
    fd.set('thb', '250');

    await expect(editEntryAction(fd)).rejects.toThrow('Choose a valid currency.');
  });
});
