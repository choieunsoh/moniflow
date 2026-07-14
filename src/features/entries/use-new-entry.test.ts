import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';
import { setFxRates, setCardFeePct } from '@features/settings/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useNewEntry } from './use-new-entry';

describe('useNewEntry', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
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
});
