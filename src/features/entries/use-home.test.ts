import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { addEntries } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// The pace gate depends on how far into the cycle "today" is, so the clock has to be pinned or the
// test's meaning changes with the calendar.
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-05'),
}));

import { getBrowserDb } from '@db/browser';
import { todayIso } from '@shared/date';
import { useHome } from './use-home';

describe('useHome', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureBudgetsTable(db);
    // Cutoff defaults to 18, so 2026-07-01 falls in the cycle keyed '2026-06'.
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-02', account: 'Cash', category: 'Food', amount: -50 },
      { date: '2026-07-03', account: 'Cash', category: 'Transport', amount: -20 },
    ]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads the cycle summary + donut slices from the seeded ledger', async () => {
    const { result } = renderHook(() => useHome('2026-06'));
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.activeKey).toBe('2026-06');
    expect(data.summary.count).toBe(3);
    expect(data.total).toBe(170);
    expect(data.slices.map((s) => s.name).sort()).toEqual(['Food', 'Transport']);
    const food = data.slices.find((s) => s.name === 'Food');
    expect(food?.value).toBe(150);
    expect(food?.count).toBe(2);

    // The list view fills its bars from this map, so a category reads the same colour in both views.
    expect(data.sliceColors.get('Food')).toBe(food?.color);
    expect(data.sliceColors.get('Transport')).toBe(
      data.slices.find((s) => s.name === 'Transport')?.color,
    );
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useHome('2026-06'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.summary.count).toBe(3);

    const db = await getBrowserDb();
    await addEntries(db, [{ date: '2026-07-04', account: 'Cash', category: 'Food', amount: -30 }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.summary.count).toBe(4));
    expect(result.current.data?.total).toBe(200);
  });

  // "N% over pace" compares spend-share against time-share. In the first days of a cycle time-share
  // is near zero, so any spend at all reads as "over pace" — an alarm with no information, on the
  // calmest day of the cycle. Home holds the phrase back until the same MIN_PROJECT_DAYS floor the
  // dashboard's projection uses. The meter tick is unaffected; it's geometry, not a verdict.
  describe('showPace', () => {
    it('is false in the opening days of the current cycle', async () => {
      // Cutoff 18 → cycle '2026-06' runs 2026-06-18…2026-07-17. Day 1.
      vi.mocked(todayIso).mockReturnValue('2026-06-18');
      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.data?.isCurrentCycle).toBe(true);
      expect(result.current.data?.progress.day).toBe(1);
      expect(result.current.data?.showPace).toBe(false);
    });

    it('is true once enough of the cycle has elapsed to mean something', async () => {
      vi.mocked(todayIso).mockReturnValue('2026-06-22'); // day 5
      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.data?.progress.day).toBe(5);
      expect(result.current.data?.showPace).toBe(true);
    });

    it('is false on a past cycle, where there is no "today" to pace against', async () => {
      vi.mocked(todayIso).mockReturnValue('2026-08-01'); // cycle '2026-07' is current
      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.data?.isCurrentCycle).toBe(false);
      expect(result.current.data?.pacePct).toBeUndefined();
      expect(result.current.data?.showPace).toBe(false);
    });
  });
});
