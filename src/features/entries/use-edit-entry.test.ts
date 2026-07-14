import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries, getEntries } from './queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useEditEntry } from './use-edit-entry';

describe('useEditEntry', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
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
  });

  it('resolves ready with data null for an id that does not exist', async () => {
    const { result } = renderHook(() => useEditEntry(999999));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
