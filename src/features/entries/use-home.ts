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
import { dayPace, type DayPace } from './day-pace';
import { splitBudgetSpend, discretionaryByDate } from './off-budget';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import { listRules } from '@features/recurring/queries';
import { committedThisCycle, type Committed } from '@features/recurring/upcoming';
import { getEffectiveRates } from '@features/recurring/effective-rates';

// The current cycle's forward-looking figures, folded in from the former /dashboard screen. Present
// only when the cycle on screen is the current one — safe-to-spend and a projection only mean
// something looking AHEAD, so a past cycle carries null and the page hides them, leaving the donut.
export type HomeForward = {
  safePerDay: number | null;
  // Today's allowance: the same safe-to-spend figure, but frozen at the value it held at the START
  // of today, so spending during the day does not move the target you are spending against.
  // safePerDay answers "what's my rate from here?" and slides down with every purchase; this answers
  // "what did I have to spend today?" and holds still until tomorrow. null exactly when safePerDay
  // is — no total budget, nothing to divide.
  todayAllowance: number | null;
  // Discretionary spend dated today, so the card can show progress against the frozen allowance.
  spentToday: number;
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
  // This cycle's fixed cost, posted so far — the part of `total` that came off the ceiling instead of
  // counting as spend. Disclosed under the meter so the money is visible somewhere, since the Budgets
  // page drops these rows from its per-category meters.
  fixedPosted: number;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  limits: Map<string, number>;
  totalStatus: BudgetTotal | null;
  progress: Progress;
  pacePct: number | undefined;
  showPace: boolean;
  forward: HomeForward | null;
  // How the cycle's COMPLETED days landed against the allowance each of them had. null without a
  // total budget (no target to grade against) and on a cycle's first day (nothing finished yet).
  dayPace: DayPace | null;
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
      // The headline total, NOT summed from the (filtered) slices — toDonutSlices drops any
      // net-positive category, so a category whose refunds outweigh its spend this cycle would
      // silently stop contributing to the total too, disagreeing with every other surface (Trends,
      // /month, /report, /year, Records) which all total the unfiltered set. summary.net is the
      // signed sum of every entry this cycle (spend negative, refund positive); negating it gives
      // the all-in spend total. The ring itself keeps dropping the wedge — only the headline changes.
      const total = -summary.net;
      // The donut stays all-in (total, above); the budget meter, safe-to-spend and pace read only
      // discretionary spend — off-budget entries (per-entry override or a flagged category) drop out,
      // and so do fixed ones (bills a standing rule posted itself), which instead come off the
      // ceiling below.
      const {
        discretionary,
        offBudget: offBudgetTotal,
        fixed: fixedPosted,
      } = splitBudgetSpend(cycleEntries, offBudgetCategories, travelCurrencies);
      // One colour per category, shared by the donut legend and the ranked list, so a category keeps
      // the same identity across the view toggle. Categories past the palette fold into Other and are
      // absent here — the list falls back to the accent for them, which is correct: they have no
      // slice to match.
      const sliceColors = new Map(slices.filter((s) => !s.other).map((s) => [s.name, s.color]));

      // Standing budgets: the category=null row is the whole-cycle total; the rest are per-category
      // caps keyed by name. discretionary (below) is already a net figure — spend minus any refund
      // in the same discretionary set — not a magnitude to be abs'd.
      const budgetRows = await getBudgets(db);
      const totalLimit = budgetRows.find((b) => b.category === null)?.amount ?? null;
      const limits = new Map<string, number>();
      for (const b of budgetRows) {
        if (b.category !== null) limits.set(b.category, b.amount);
      }
      // Time elapsed in the cycle drives both the standalone header bar and the "today" pace tick on
      // the budget meters — but a pace mark only makes sense while the cycle is live, so pacePct is
      // undefined on a past cycle (no tick), matching the header bar hiding there.
      const progress = cycleProgress(cycle, todayIso());
      const pacePct = isCurrentCycle ? (progress.day / progress.total) * 100 : undefined;
      // The pace *tick* rides on pacePct above and shows from day 1 — it's neutral geometry. The
      // pace *phrase* is a verdict, and on day 1 time-elapsed is ~3%, so any spend at all reads as
      // "over pace". Hold the wording back until the same floor the dashboard projects from.
      const showPace = pacePct !== undefined && progress.day >= MIN_PROJECT_DAYS;

      // THE CEILING — what this cycle actually leaves you to decide about. A fixed cost is money that
      // was never available to spend, so it comes OUT OF THE BUDGET rather than counting as spend
      // against it: a ฿50,000 budget with a ฿1,720 electricity bill is a ฿48,280 budget.
      //
      // Both halves of the cycle's fixed cost are reserved at once — bills that have already posted
      // (fixedPosted) and bills still to come (upcoming) — and that is what holds the ceiling STILL.
      // On the day a bill posts it merely moves from one half to the other and the sum does not
      // budge. Reserving only the still-to-come half is what the app did before, and it made the
      // ceiling snap down the morning a bill landed.
      //
      // listRules stays out of the top Promise.all so a past cycle — the common case when paging back
      // — never pays for it. A closed cycle needs no rules anyway: every bill that was going to post
      // in it already has, so its still-to-come half is 0 by definition.
      const [rules, fxRates] = isCurrentCycle
        ? await Promise.all([listRules(db), getEffectiveRates(db)])
        : [[], new Map<string, number>()];
      const upcoming = committedThisCycle(rules, todayIso(), cycle.end, fxRates);
      const fixedReserve = fixedPosted + upcoming.total;
      const ceiling = totalLimit === null ? null : totalLimit - fixedReserve;
      const totalStatus = ceiling === null ? null : toBudgetTotal(ceiling, discretionary);

      // Forward figures for the current cycle only.
      let forward: HomeForward | null = null;
      if (isCurrentCycle) {
        const daysLeft = progress.total - progress.day + 1; // today inclusive
        // "As of the start of today" is DERIVED, not snapshotted: run the same split over the
        // entries dated today and take them back out of spend. That beats storing a daily snapshot
        // on every count — no midnight job to miss, the figure is identical whether the app is first
        // opened at 00:01 or 23:59, and it is right on a device that has never been opened today.
        // Splitting rather than subtracting keeps the off-budget rule in exactly one place.
        const { discretionary: spentToday } = splitBudgetSpend(
          cycleEntries.filter((e) => e.date === todayIso()),
          offBudgetCategories,
          travelCurrencies,
        );
        forward = {
          safePerDay: safeToSpendPerDay(ceiling, discretionary, daysLeft),
          // Same fn, same ceiling, earlier `spent` — the allowance is not a second formula.
          // `discretionary - spentToday` also leaves any future-dated entry in, which is right: it
          // was already on the books when the day started.
          //
          // The ceiling is NOT rewound for a bill that posted today, deliberately: `spentToday` is
          // about choices you made today, and a self-posting bill is not one. Rewinding it would
          // also drop that bill out of BOTH halves of the reserve for a day — committedThisCycle
          // only counts bills posting AFTER today — and hand back an allowance that quietly spends
          // the electricity money.
          todayAllowance: safeToSpendPerDay(ceiling, discretionary - spentToday, daysLeft),
          spentToday,
          avgPerDay: averagePerDay(discretionary, progress.day),
          daysLeft,
          upcoming,
        };
      }

      // How the finished days went. Available on a PAST cycle too, unlike `forward` — grading days
      // that are over needs no forward look, and the ceiling a closed cycle carries is stable (its
      // still-to-come bill half is 0 by definition).
      const pace = dayPace(
        discretionaryByDate(cycleEntries, offBudgetCategories, travelCurrencies),
        cycle,
        todayIso(),
        ceiling,
      );

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
        fixedPosted,
        emojiMap,
        hueMap,
        iconSet,
        limits,
        totalStatus,
        progress,
        pacePct,
        showPace,
        forward,
        dayPace: pace,
        ledgerEmpty,
      });
      setReady(true);
    });
  }, [cycleKey, version]);

  return { ready, data };
}
