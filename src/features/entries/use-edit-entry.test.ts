import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { addEntries, getEntries } from './queries';
import { setCategoryOffBudget } from '@features/categories/queries';
import { setCurrencyArchived } from '@features/currencies/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useEditEntry } from './use-edit-entry';

describe('useEditEntry', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureCurrenciesTable(db);
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-02', account: 'Cash', category: 'Salary', amount: 5000 },
    ]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads a keypad-editable (expense) entry + keypad lists', async () => {
    const db = await getBrowserDb();
    const [expense] = await getEntries(db);

    const { result } = renderHook(() => useEditEntry(expense.id));
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.keypadEditable).toBe(true);
    expect(data.entry.id).toBe(expense.id);
    if (!data.keypadEditable) throw new Error('unreachable — checked above');
    expect(data.categories.map((c) => c.name)).toContain('Food');
    expect(data.accounts.map((a) => a.name)).toContain('Cash');
  });

  it('loads an income entry onto the plain form (not the keypad)', async () => {
    const db = await getBrowserDb();
    const income = (await getEntries(db)).find((e) => e.amount > 0);
    if (income === undefined) throw new Error('seed missing an income row');

    const { result } = renderHook(() => useEditEntry(income.id));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.keypadEditable).toBe(false);
    if (data.keypadEditable) throw new Error('unreachable — checked above');
    expect(data.categories).toContain('Salary');
    expect(data.accounts).toContain('Cash');
    expect(data.offBudgetCategories).toBeInstanceOf(Set);
  });

  it('carries the off-budget category set for the plain form to default its toggle from', async () => {
    const db = await getBrowserDb();
    await setCategoryOffBudget(db, 'Salary', true);
    const income = (await getEntries(db)).find((e) => e.amount > 0);
    if (income === undefined) throw new Error('seed missing an income row');

    const { result } = renderHook(() => useEditEntry(income.id));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null || data.keypadEditable) throw new Error('unreachable — checked above');
    expect(data.offBudgetCategories).toEqual(new Set(['Salary']));
  });

  // Archiving a currency hides it from the picker (getKeypadCurrencies/listCurrencies), but a
  // historical entry already in that currency must still be recognised as such when opened for
  // editing — recognition (Keypad's isCurrency fallback) needs every known code, archived included,
  // not just the ones still on offer. Getting this wrong is a real data-loss path: the Keypad falls
  // back to 'THB' for an unrecognised currency, and initialForeign then reads entry.amount (the
  // THB-converted figure) instead of entry.originalAmount — saving rewrites the row's currency and
  // drops its original foreign amount.
  it('recognises an existing entry as being in an archived currency, not silently THB', async () => {
    const db = await getBrowserDb();
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

    const { result } = renderHook(() => useEditEntry(entry.id));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null || !data.keypadEditable) throw new Error('unreachable — checked above');

    expect(data.currencyCodes.has('JPY')).toBe(true);
  });

  it('resolves ready with data null for an id that does not exist', async () => {
    const { result } = renderHook(() => useEditEntry(999999));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
