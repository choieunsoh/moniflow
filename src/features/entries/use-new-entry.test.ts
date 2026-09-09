import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { addEntries, getEntries } from './queries';
import { setFxRates, setCardFeePct } from '@features/settings/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useNewEntry } from './use-new-entry';

describe('useNewEntry', () => {
  let db: Db;

  beforeEach(async () => {
    db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureCurrenciesTable(db);
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-02', account: 'Card', category: 'Transport', amount: -20 },
    ]);
    await setFxRates(db, { USD: { thbPerUnit: 36, asOf: '2026-07-01' } });
    await setCardFeePct(db, 2);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads the keypad lists + latest account + effective rates', async () => {
    const { result } = renderHook(() => useNewEntry());
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    // Latest entry (by date) was on Card, so that's the default for the next one.
    expect(data.defaultAccount).toBe('Card');
    expect(data.categories.map((c) => c.name).sort()).toEqual(['Food', 'Transport']);
    expect(data.accounts.map((a) => a.name).sort()).toEqual(['Card', 'Cash']);
    // 36 * 1.02 (2% card fee) = 36.72
    expect(data.rates.USD).toBeCloseTo(36.72);
    expect(data.ratesAsOf.USD).toBe('2026-07-01');
  });

  // Duplicating a row is the same keypad, pre-filled from an existing entry: the amount, category,
  // account and note come back, but the DATE does not — a copy is something you are spending today.
  it('loads the copied row as a template when given a copy id', async () => {
    const [source] = await getEntries(db);

    const { result } = renderHook(() => useNewEntry(source.id));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.data?.template?.category).toBe(source.category);
    expect(result.current.data?.template?.amount).toBe(source.amount);
  });

  it('has no template without a copy id', async () => {
    const { result } = renderHook(() => useNewEntry());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.template).toBeNull();
  });

  // A stale link (?copy= for a row since deleted) must still open a usable blank keypad, not an
  // error screen — the entry is gone, the intent to add one is not.
  it('opens a blank keypad when the copied row no longer exists', async () => {
    const { result } = renderHook(() => useNewEntry(999999));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data).not.toBeNull();
    expect(result.current.data?.template).toBeNull();
  });
});
