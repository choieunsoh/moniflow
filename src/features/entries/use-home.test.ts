import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
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
    await ensureCurrenciesTable(db);
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
      await ensureCurrenciesTable(db);
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
    it('carries safe-to-spend and upcoming for the current cycle', async () => {
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
      expect(f.daysLeft).toBe(data.progress.total - 5 + 1); // today inclusive
      expect(f.safePerDay).toBeCloseTo((3000 - 170) / f.daysLeft);
      expect(f.upcoming).toEqual({ total: 0, count: 0, byCurrency: [] }); // no recurring rules seeded
    });

    it('is null on a past cycle — nothing to look ahead to', async () => {
      vi.mocked(todayIso).mockReturnValue('2026-08-01'); // makes '2026-07' current, so '2026-06' is past
      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.data?.isCurrentCycle).toBe(false);
      expect(result.current.data?.forward).toBeNull();
    });

    it('has no projected figure — the budget-fit projection was retired', async () => {
      vi.mocked(todayIso).mockReturnValue('2026-06-22'); // day 5 of the current cycle '2026-06'
      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const { data } = result.current;
      if (data === null) throw new Error('unreachable — ready implies data');
      expect(data.forward).not.toBeNull();
      expect(data.forward).not.toHaveProperty('projected');
    });
  });

  // The whole point of the allowance: it is the safe-to-spend figure as of the START of today, so
  // spending during the day moves safePerDay but must NOT move todayAllowance. Derived by excluding
  // entries dated today — no snapshot, so it is the same number whether the app is opened at 00:01
  // or 23:59, and on a device that has never been opened today at all.
  describe('todayAllowance', () => {
    // Pinned here rather than inherited: mockReturnValue persists across tests, so the date left
    // behind by whichever describe ran last would otherwise decide this one's arithmetic. At
    // 2026-07-05 the cycle '2026-06' is current (day 18 of 30, 13 left) and the three seeded
    // entries (07-01/02/03, 170 total) all fall BEFORE today.
    beforeEach(() => {
      vi.mocked(todayIso).mockReturnValue('2026-07-05');
    });

    it('freezes at the start-of-day figure while today’s spend moves safePerDay', async () => {
      const db = await getBrowserDb();
      await setBudget(db, null, 3000);
      await addEntries(db, [
        { date: '2026-07-05', account: 'Cash', category: 'Food', amount: -80 },
      ]);

      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const f = result.current.data?.forward;
      if (!f) throw new Error('unreachable — the current cycle always carries forward figures');

      expect(f.daysLeft).toBe(13);
      expect(f.spentToday).toBe(80);
      // Allowance ignores today's 80: (3000 - 170) / 13.
      expect(f.todayAllowance).toBeCloseTo((3000 - 170) / 13);
      // safePerDay does not: (3000 - 250) / 13.
      expect(f.safePerDay).toBeCloseTo((3000 - 250) / 13);

      // Spend again today. The allowance is unchanged; only spentToday and safePerDay move.
      await addEntries(db, [
        { date: '2026-07-05', account: 'Cash', category: 'Food', amount: -45 },
      ]);
      act(() => bumpDataVersion());
      await waitFor(() => expect(result.current.data?.forward?.spentToday).toBe(125));

      const after = result.current.data?.forward;
      if (!after) throw new Error('unreachable');
      expect(after.todayAllowance).toBeCloseTo((3000 - 170) / 13);
      expect(after.safePerDay).toBeCloseTo((3000 - 295) / 13);
    });

    it('is null with no total budget, matching safePerDay', async () => {
      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.data?.forward?.todayAllowance).toBeNull();
      expect(result.current.data?.forward?.safePerDay).toBeNull();
    });

    it('drops off-budget spend from both the allowance and today’s figure', async () => {
      const db = await getBrowserDb();
      await setBudget(db, null, 3000);
      await addEntries(db, [
        { date: '2026-07-02', account: 'Cash', category: 'Rent', amount: -500, offBudget: 1 },
        { date: '2026-07-05', account: 'Cash', category: 'Rent', amount: -300, offBudget: 1 },
        { date: '2026-07-05', account: 'Cash', category: 'Food', amount: -60 },
      ]);

      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const f = result.current.data?.forward;
      if (!f) throw new Error('unreachable');

      expect(f.spentToday).toBe(60); // the 300 off-budget one does not count
      expect(f.todayAllowance).toBeCloseTo((3000 - 170) / 13); // nor does the 500
    });
  });

  describe('off-budget split', () => {
    it('excludes off-budget spend from totalStatus/safe-to-spend but keeps the donut all-in', async () => {
      vi.mocked(todayIso).mockReturnValue('2026-06-22'); // day 5 of the current cycle '2026-06'
      const db = await getBrowserDb();
      await setBudget(db, null, 3000); // total budget
      // Seeded cycle '2026-06' already carries 170 (100 + 50 + 20) discretionary. Add an off-budget
      // entry via the per-entry override — it must count toward the donut total but drop out of the
      // budget meter, safe-to-spend, and pace.
      await addEntries(db, [
        { date: '2026-06-20', account: 'Cash', category: 'Rent', amount: -500, offBudget: 1 },
      ]);
      act(() => bumpDataVersion());

      const { result } = renderHook(() => useHome(null));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const { data } = result.current;
      if (data === null) throw new Error('unreachable — ready implies data');

      expect(data.total).toBe(670); // all-in: 170 + 500
      expect(data.offBudgetTotal).toBe(500);
      expect(data.totalStatus).not.toBeNull();
      expect(data.totalStatus?.spent).toBe(170); // discretionary only

      const f = data.forward;
      if (f === null) throw new Error('unreachable — asserted non-null above');
      expect(f.avgPerDay).toBeCloseTo(170 / 5); // discretionary spend over 5 elapsed days
      expect(f.safePerDay).toBeCloseTo((3000 - 170) / f.daysLeft);
    });
  });

  // `total` used to be summed from the (filtered) donut slices, which drop any category that nets
  // positive — a refund-heavy category vanished from the total right along with its wedge. Every
  // existing `data.total` assertion in this file is all-spend, where `-summary.net` and the old
  // slice-sum formula agree; this seeds a refund big enough to flip Food net-positive, where they
  // don't. Pinned locally rather than trusting the file-level mock, which leaks its last
  // `mockReturnValue` across tests.
  describe('total with a net-positive category', () => {
    beforeEach(() => {
      vi.mocked(todayIso).mockReturnValue('2026-07-05');
    });

    it('sums the signed total across categories, not the (net-positive-dropping) donut slices', async () => {
      const db = await getBrowserDb();
      // Seeded cycle '2026-06' already carries Food -100, Food -50, Transport -20 (net -170). A +200
      // refund flips Food to net +50, which toDonutSlices drops from the ring entirely — the donut
      // then sums to 20 (Transport alone), but the true all-in total is -170 + 200 = 30, so the
      // headline is -30.
      await addEntries(db, [
        { date: '2026-07-01', account: 'Cash', category: 'Food', amount: 200 },
      ]);

      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const { data } = result.current;
      expect(data).not.toBeNull();
      if (data === null) throw new Error('unreachable — checked above');

      expect(data.slices.map((s) => s.name)).toEqual(['Transport']); // Food's wedge is dropped
      expect(data.total).toBe(-30);
    });
  });

  describe('topTransactions', () => {
    it('exposes the active cycle entries ranked by magnitude, biggest first', async () => {
      const { result } = renderHook(() => useHome('2026-06'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const top = result.current.data?.topTransactions ?? [];
      // Seeded cycle 2026-06: Food -100, Food -50, Transport -20.
      expect(top.map((e) => e.amount)).toEqual([-100, -50, -20]);
    });
  });
});
