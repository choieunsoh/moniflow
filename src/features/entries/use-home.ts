'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import {
  getCycleSummary,
  getCategoryBreakdown,
  hasAnyExpense,
  getEntriesInRange,
  type Summary,
  type Breakdown,
} from './queries';
import { topTransactions } from './top-transactions';
import type { EntryRow } from './schema';
import { cycleFromKey, currentCycleKey, cycleProgress, type Cycle, type Progress } from './cycle';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getBudgets } from '@features/budgets/queries';
import { toBudgetTotal, type BudgetTotal } from '@features/budgets/budget-status';
import { getEmojiMap, getHueMap, getOffBudgetCategories } from '@features/categories/queries';
import { getTravelCurrencies } from '@features/currencies/queries';
import { toDonutSlices, type DonutSlice } from './donut';
import { safeToSpendPerDay, averagePerDay, MIN_PROJECT_DAYS } from './dashboard';
import { splitBudgetSpend } from './off-budget';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import { listRules } from '@features/recurring/queries';
import { committedThisCycle, type Committed } from '@features/recurring/upcoming';

// The current cycle's forward-looking figures, folded in from the former /dashboard screen. Present
// only when the cycle on screen is the current one — safe-to-spend and a projection only mean
// something looking AHEAD, so a past cycle carries null and the page hides them, leaving the donut.
export type HomeForward = {
  safePerDay: number | null;
  avgPerDay: number;
  daysLeft: number;
  upcoming: Committed;
};

export type HomeData = {
  cutoff: number;
  activeKey: string;
  currentKey: string;
  canGoNext: boolean;
  isCurrentCycle: boolean;
  cycle: Cycle;
  summary: Summary;
  categoryBreakdown: Breakdown[];
  topTransactions: EntryRow[];
  slices: DonutSlice[];
  sliceColors: Map<string, string>;
  total: number;
  offBudgetTotal: number;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  limits: Map<string, number>;
  totalStatus: BudgetTotal | null;
  progress: Progress;
  pacePct: number | undefined;
  showPace: boolean;
  forward: HomeForward | null;
  // True only when the ledger is empty EVERYWHERE, not just in the cycle on screen. Home shows
  // first-run onboarding on the former and a quiet "nothing this cycle" on the latter.
  ledgerEmpty: boolean;
};

// Home page's cycle data, read once via the browser OPFS db after mount — mirrors the server
// computation the page used to run in a Server Component, just moved client-side + async. Re-runs
// whenever the ?cycle= param (the caller's cycleKey) changes.
export function useHome(cycleKey: string | null): { ready: boolean; data: HomeData | null } {
  const [data, setData] = useState<HomeData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();
  // The cycle whose data is currently on screen — state, not a ref, because it is read during
  // render below and a ref read there is both a lint error and genuinely unsafe. Lets us tell a
  // CYCLE CHANGE (new content) apart from a DATA-VERSION bump (a refetch of what is already
  // rendered).
  const [shownKey, setShownKey] = useState<string | null | undefined>(undefined);

  // Reset DURING RENDER, not in the effect and not inside the async callback — React's documented
  // "adjusting state when a prop changes" pattern. The other two placements each cost something: in
  // the effect body it is a setState the react-hooks rule rejects as a cascading-render risk, and
  // inside the withDb callback it lands a microtask late, leaving a window where the hook reports
  // ready with the PREVIOUS cycle's figures under the new cycle's key. Here it is immediate, and
  // re-setting false when it is already false is a no-op bail-out rather than a loop.
  //
  // `ready` means "there is data to render", not "a fetch is in flight". Home's own affordances
  // write — recolouring a category from its legend disc, editing an entry — and each bumps the data
  // version. Dropping ready on those replaced the entire settled page (donut, legend, budget meter,
  // ~330px of it) with the loading skeleton for the OPFS round trip, so a colour tap blanked the
  // screen and bounced the scroll position. A cycle change still shows the skeleton: that IS new
  // content, and holding the old figures under a new cycle label would state the wrong month's spend.
  if (shownKey !== cycleKey) {
    setShownKey(cycleKey);
    setReady(false);
  }

  useEffect(() => {
    void withDb(async (db) => {
      const [cutoff, emojiMap, hueMap, iconSet, offBudgetCategories, travelCurrencies] =
        await Promise.all([
          getCutoff(db),
          getEmojiMap(db),
          getHueMap(db),
          getIconSet(db),
          getOffBudgetCategories(db),
          getTravelCurrencies(db),
        ]);

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeKey = cycleKey ?? currentKey;
      // No future cycles to spend in yet — cap forward navigation at today's cycle.
      const canGoNext = activeKey < currentKey;
      const isCurrentCycle = activeKey === currentKey;
      const cycle = cycleFromKey(activeKey, cutoff);
      const [summary, categoryBreakdown, cycleEntries] = await Promise.all([
        getCycleSummary(db, cycle.start, cycle.end),
        getCategoryBreakdown(db, cycle.start, cycle.end),
        getEntriesInRange(db, cycle.start, cycle.end),
      ]);

      const topTx = topTransactions(cycleEntries);
      const slices = toDonutSlices(categoryBreakdown);
      const total = slices.reduce((sum, s) => sum + s.value, 0);
      // The donut stays all-in (total, above); the budget meter, safe-to-spend and pace read only
      // discretionary spend — off-budget entries (per-entry override or a flagged category) drop out.
      const { discretionary, offBudget: offBudgetTotal } = splitBudgetSpend(
        cycleEntries,
        offBudgetCategories,
        travelCurrencies,
      );
      // One colour per category, shared by the donut legend and the ranked list, so a category keeps
      // the same identity across the view toggle. Categories past the palette fold into Other and are
      // absent here — the list falls back to the accent for them, which is correct: they have no
      // slice to match.
      const sliceColors = new Map(slices.filter((s) => !s.other).map((s) => [s.name, s.color]));

      // Standing budgets: the category=null row is the whole-cycle total; the rest are per-category
      // caps keyed by name. Spend magnitudes come straight from the category breakdown (totals are
      // negative — take the abs).
      const budgetRows = await getBudgets(db);
      const totalLimit = budgetRows.find((b) => b.category === null)?.amount ?? null;
      const limits = new Map<string, number>();
      for (const b of budgetRows) {
        if (b.category !== null) limits.set(b.category, b.amount);
      }
      const totalStatus = totalLimit === null ? null : toBudgetTotal(totalLimit, discretionary);

      // Time elapsed in the cycle drives both the standalone header bar and the "today" pace tick on
      // the budget meters — but a pace mark only makes sense while the cycle is live, so pacePct is
      // undefined on a past cycle (no tick), matching the header bar hiding there.
      const progress = cycleProgress(cycle, todayIso());
      const pacePct = isCurrentCycle ? (progress.day / progress.total) * 100 : undefined;
      // The pace *tick* rides on pacePct above and shows from day 1 — it's neutral geometry. The
      // pace *phrase* is a verdict, and on day 1 time-elapsed is ~3%, so any spend at all reads as
      // "over pace". Hold the wording back until the same floor the dashboard projects from.
      const showPace = pacePct !== undefined && progress.day >= MIN_PROJECT_DAYS;

      // Forward figures for the current cycle only. listRules is fetched here (not in the top Promise.all)
      // so a past cycle — the common case when paging back — never pays for it.
      let forward: HomeForward | null = null;
      if (isCurrentCycle) {
        const rules = await listRules(db);
        const daysLeft = progress.total - progress.day + 1; // today inclusive
        const upcoming = committedThisCycle(rules, todayIso(), cycle.end);
        forward = {
          safePerDay: safeToSpendPerDay(totalLimit, discretionary, upcoming.total, daysLeft),
          avgPerDay: averagePerDay(discretionary, progress.day),
          daysLeft,
          upcoming,
        };
      }

      // Only asked when this cycle came back empty — a populated cycle is already proof the ledger
      // has something in it, so the common path never pays for the extra round trip.
      const ledgerEmpty = summary.count === 0 ? !(await hasAnyExpense(db)) : false;

      setData({
        cutoff,
        activeKey,
        currentKey,
        canGoNext,
        isCurrentCycle,
        cycle,
        summary,
        categoryBreakdown,
        topTransactions: topTx,
        slices,
        sliceColors,
        total,
        offBudgetTotal,
        emojiMap,
        hueMap,
        iconSet,
        limits,
        totalStatus,
        progress,
        pacePct,
        showPace,
        forward,
        ledgerEmpty,
      });
      setReady(true);
    });
  }, [cycleKey, version]);

  return { ready, data };
}
