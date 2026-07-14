import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, ensureTripTitlesTable } from './schema';
import { addEntries, setTripTitle } from './queries';
import { tripId } from './trips';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useTrips } from './use-trips';

describe('useTrips', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureTripTitlesTable(db);
    await addEntries(db, [
      {
        date: '2026-07-11',
        account: 'Cash',
        category: 'Travel',
        amount: -3000,
        currency: 'JPY',
        originalAmount: -12000,
      },
      {
        date: '2026-07-15',
        account: 'Cash',
        category: 'Travel',
        amount: -1000,
        currency: 'JPY',
        originalAmount: -4000,
      },
      // Single-day THB entries never form a trip and are excluded from getForeignEntries entirely.
      { date: '2026-07-20', account: 'Cash', category: 'Food', amount: -100 },
    ]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then groups foreign entries into trips', async () => {
    const { result } = renderHook(() => useTrips());
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.trips).toHaveLength(1);
    expect(data.trips[0]?.currency).toBe('JPY');
    expect(data.trips[0]?.count).toBe(2);
    expect(data.trips[0]?.originalTotal).toBe(16000);
    expect(data.titles.size).toBe(0);
  });

  it('surfaces a saved trip title keyed by tripId', async () => {
    const db = await getBrowserDb();
    await setTripTitle(db, tripId('JPY', '2026-07-11'), 'Osaka trip');

    const { result } = renderHook(() => useTrips());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.titles.get(tripId('JPY', '2026-07-11'))).toBe('Osaka trip');
  });

  it('refetches when the data-version bumps after a rename', async () => {
    const { result } = renderHook(() => useTrips());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.titles.size).toBe(0);

    const db = await getBrowserDb();
    await setTripTitle(db, tripId('JPY', '2026-07-11'), 'Osaka trip');
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.titles.size).toBe(1));
  });
});
