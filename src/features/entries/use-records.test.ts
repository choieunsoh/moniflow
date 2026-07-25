import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useRecords } from './use-records';

describe('useRecords', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    // Cutoff defaults to 18, so 2026-07-01..03 fall in the cycle keyed '2026-06'.
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      // A second account in the cycle, so the by-account grouping has more than one bucket to rank.
      { date: '2026-07-02', account: 'Bangkok Bank', category: 'Food', amount: -50 },
      { date: '2026-07-03', account: 'Cash', category: 'Transport', amount: -20 },
      // A different cycle — only reachable via search/all-category, not the default cycle view.
      {
        date: '2026-05-01',
        account: 'Cash',
        category: 'Food',
        amount: -999,
        note: 'concert ticket',
      },
      // A foreign-currency trip, outside the '2026-06' cycle window.
      {
        date: '2026-07-20',
        account: 'Cash',
        category: 'Travel',
        amount: -3000,
        currency: 'JPY',
        originalAmount: -12000,
      },
      {
        date: '2026-07-22',
        account: 'Cash',
        category: 'Travel',
        amount: -1000,
        currency: 'JPY',
        originalAmount: -4000,
      },
    ]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads the cycle entries grouped by day', async () => {
    const { result } = renderHook(() => useRecords({ cycle: '2026-06' }));
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.activeKey).toBe('2026-06');
    expect(data.spanAll).toBe(false);
    expect(data.entries).toHaveLength(3);
    expect(data.total).toBe(-170);
    expect(data.sections).toHaveLength(3); // one per distinct day
    expect(data.sections[0]?.key).toBe('2026-07-03'); // newest first
  });

  it('groups the cycle by account, largest spend first', async () => {
    const { result } = renderHook(() => useRecords({ cycle: '2026-06', view: 'account' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data?.groupBy).toBe('account');
    // Cash holds -100 + -20; Bangkok Bank just -50, so Cash ranks first.
    expect(data?.sections.map((s) => s.key)).toEqual(['Cash', 'Bangkok Bank']);
    expect(data?.sections[0]?.total).toBe(-120);
    expect(data?.sections[1]?.total).toBe(-50);
    expect(data?.total).toBe(-170); // the cycle total is unchanged by how it's grouped
  });

  it('falls back to date grouping for an unrecognised view param', async () => {
    const { result } = renderHook(() => useRecords({ cycle: '2026-06', view: 'bogus' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.groupBy).toBe('date');
  });

  it('filters by category chip within the cycle', async () => {
    const { result } = renderHook(() => useRecords({ cycle: '2026-06', category: 'Food' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data?.filtered).toBe(true);
    expect(data?.entries).toHaveLength(2);
    expect(data?.total).toBe(-150);
  });

  it('search spans every cycle, ignoring the chip filters', async () => {
    const { result } = renderHook(() => useRecords({ q: 'concert' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data?.searching).toBe(true);
    expect(data?.spanAll).toBe(true);
    expect(data?.entries).toHaveLength(1);
    expect(data?.entries[0]?.date).toBe('2026-05-01');
  });

  it('trip mode reads one foreign currency within its date range', async () => {
    const { result } = renderHook(() =>
      useRecords({ currency: 'JPY', from: '2026-07-18', to: '2026-07-25' }),
    );
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data?.tripMode).toBe(true);
    expect(data?.entries).toHaveLength(2);
    expect(data?.currencySums).toEqual([{ currency: 'JPY', total: 16000 }]);
  });

  describe('sort=amount', () => {
    it('ranks the cycle entries biggest-first in a single section', async () => {
      // Cycle '2026-06' holds -100 (07-01), -50 (07-02), -20 (07-03) — newest-first date order is
      // already the reverse of amount order, so this genuinely discriminates the two orderings.
      const { result } = renderHook(() => useRecords({ cycle: '2026-06', sort: 'amount' }));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const { data } = result.current;
      expect(data?.sections).toHaveLength(1);
      expect(data?.sections[0]?.key).toBe('amount');
      const amounts = data?.sections[0]?.entries.map((e) => Math.abs(e.amount)) ?? [];
      expect(amounts).toEqual([100, 50, 20]);
      expect(data?.sections[0]?.total).toBe(-170);
    });

    it('is ignored for search, trip, and all-category views', async () => {
      const { result } = renderHook(() => useRecords({ q: 'concert', sort: 'amount' }));
      await waitFor(() => expect(result.current.ready).toBe(true));
      // Still spans all cycles / keeps its own ordering — not collapsed to a single 'amount' section.
      expect(result.current.data?.sections[0]?.key).not.toBe('amount');
    });
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useRecords({ cycle: '2026-06' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.entries).toHaveLength(3);

    const db = await getBrowserDb();
    await addEntries(db, [{ date: '2026-07-04', account: 'Cash', category: 'Food', amount: -30 }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.entries).toHaveLength(4));
    expect(result.current.data?.total).toBe(-200);
  });
});
