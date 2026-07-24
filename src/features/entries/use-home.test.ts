import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { addEntries } from './queries';
import { bumpDataVersion } from '@shared/data-version';
import { setBudget } from '@features/budgets/queries';

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
    await ensureRecurrencesTable(db);
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

  describe('ledgerEmpty', () => {
    it('is false for an empty cycle when the ledger has history elsewhere', async () => {
      // '2026-04' holds nothing, but the seeded entries make the LEDGER non-empty — home must not
      // greet a user with history as a first-run visitor.
      const { result } = renderHook(() => useHome('2026-04'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.data?.summary.count).toBe(0);
      expect(result.current.data?.ledgerEmpty).toBe(false);
    });

    it('is false when the cycle on screen has spending', async () => {
      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.data?.ledgerEmpty).toBe(false);
    });

    it('is true only when the ledger holds no expense at all', async () => {
      const db = makeNodeProxyDb();
      await ensureEntriesTable(db);
      await ensureSettingsTable(db);
      await ensureBudgetsTable(db);
      await ensureRecurrencesTable(db);
      vi.mocked(getBrowserDb).mockResolvedValue(db);

      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.data?.ledgerEmpty).toBe(true);
    });
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

  // `ready` answers "is there data to render?", NOT "is a fetch in flight?". Home's own affordances
  // write (recolouring a category from the legend disc, deleting an entry), and each write bumps the
  // data version. Dropping ready on those unmounted the whole settled page — donut, legend, budget
  // meter — behind the loading skeleton for the OPFS round trip, so a colour tap blanked the screen.
  describe('refetch after a write', () => {
    it('keeps the settled page mounted while the refetch is in flight', async () => {
      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const before = result.current.data;
      expect(before).not.toBeNull();

      // Hold the db open so the refetch CANNOT complete — the transient state is the whole point,
      // and a refetch that resolves within the same act() flush hides it entirely.
      const db = await getBrowserDb();
      let release = (): void => {};
      const gate = new Promise<void>((res) => {
        release = res;
      });
      vi.mocked(getBrowserDb).mockImplementationOnce(async () => {
        await gate;
        return db;
      });

      await act(async () => {
        bumpDataVersion();
        // Let the effect run up to its first await — it parks on the gate above, which is exactly
        // the in-flight moment this test is about.
        await Promise.resolve();
      });

      // Mid-refetch: the settled page is still on screen rather than replaced by the skeleton.
      expect(result.current.ready).toBe(true);
      expect(result.current.data?.total).toBe(before?.total);

      await act(async () => {
        release();
        await gate;
      });
      await waitFor(() => expect(result.current.data?.total).toBe(before?.total));
    });

    // Home reaches the db through withDb, so a db that will not open is a condition, not an error:
    // the hook simply never becomes ready and AppShell's useDbHealth puts the one explanation on
    // screen. Before that split, this path threw out of a void-ed async IIFE — an unhandled
    // rejection per mounted hook, seventeen of them, all restating the same thing.
    it('stays not-ready without throwing when the db cannot be opened', async () => {
      vi.mocked(getBrowserDb).mockRejectedValue(new Error('NoModificationAllowedError'));
      const { result } = renderHook(() => useHome('2026-06'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.ready).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it('still shows the skeleton when the cycle itself changes', async () => {
      // A different cycle is different content, not a refresh of what is on screen — holding the old
      // numbers under a new cycle label would state the wrong month's spend.
      const { result, rerender } = renderHook(({ key }) => useHome(key), {
        initialProps: { key: '2026-06' },
      });
      await waitFor(() => expect(result.current.ready).toBe(true));

      // Synchronous on purpose: the reset happens during render, so there is no tick in which the
      // hook reports ready against the previous cycle's figures. If this ever needs an await to
      // pass, the reset has drifted back behind an await and that window has reopened.
      rerender({ key: '2026-05' });
      expect(result.current.ready).toBe(false);

      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.data?.activeKey).toBe('2026-05');
    });
  });

  describe('forward (current-cycle figures folded in from the old dashboard)', () => {
    it('carries safe-to-spend, projection and upcoming for the current cycle', async () => {
      vi.mocked(todayIso).mockReturnValue('2026-06-22'); // day 5 of the current cycle '2026-06'
      const db = await getBrowserDb();
      await setBudget(db, null, 3000); // total budget

      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const { data } = result.current;
      if (data === null) throw new Error('unreachable — ready implies data');

      expect(data.isCurrentCycle).toBe(true);
      expect(data.forward).not.toBeNull();
      const f = data.forward;
      if (f === null) throw new Error('unreachable — asserted non-null above');
      expect(f.avgPerDay).toBeCloseTo(170 / 5); // 170 spent over 5 elapsed days
      expect(f.projected).toBeCloseTo((170 / 5) * data.progress.total);
      expect(f.daysLeft).toBe(data.progress.total - 5 + 1); // today inclusive
      expect(f.safePerDay).toBeCloseTo((3000 - 170) / f.daysLeft);
      expect(f.upcoming).toEqual({ total: 0, count: 0 }); // no recurring rules seeded
    });

    it('is null on a past cycle — nothing to look ahead to', async () => {
      vi.mocked(todayIso).mockReturnValue('2026-08-01'); // makes '2026-07' current, so '2026-06' is past
      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.data?.isCurrentCycle).toBe(false);
      expect(result.current.data?.forward).toBeNull();
    });
  });
});
