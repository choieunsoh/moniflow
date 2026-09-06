import { safeToSpendPerDay } from './dashboard';
import { cycleProgress, type Cycle } from './cycle';
import { eachDay } from './heatmap';

export type DayPace = {
  // Days that spent nothing at all (a refund-only day counts here too — nothing left the wallet).
  noSpend: number;
  // Days that spent something, but no more than that day's allowance.
  under: number;
  // Days that spent more than that day's allowance.
  over: number;
  // The days actually judged — the denominator the card states, so "8 over" is readable.
  days: number;
};

// How each COMPLETED day of a cycle landed against the allowance it had on that day.
//
// The target is the ROLLING one, not a flat budget ÷ days: it is replayed forward through the cycle
// with `safeToSpendPerDay`, the same function the Safe-to-spend card prints, so day 5's target
// reflects everything days 1–4 spent. Overspend on Monday genuinely lowers Tuesday's bar, which is
// the behaviour the app already shows live — a flat target would grade the past against a line the
// user was never shown.
//
// TODAY IS EXCLUDED, deliberately. At 09:00 a day with no entries is not "a no-spend day", it is a
// day that has not happened; and "over target" would be the only verdict today could earn honestly.
// Home's Left-to-spend-today card owns today; this one grades the days that are finished.
//
// null when there is no ceiling to measure against (no total budget) or when no day has finished
// yet — the card renders nothing in both cases rather than three zeros.
export function dayPace(
  spendByDate: Map<string, number>,
  cycle: Cycle,
  today: string,
  ceiling: number | null,
): DayPace | null {
  if (ceiling === null) return null;
  const progress = cycleProgress(cycle, today);
  // A past cycle is complete; a live one stops before today. cycleProgress clamps `day` to the
  // cycle length, so on a past cycle `day - 1` would drop its final day — hence the branch.
  const completed = today > cycle.end ? progress.total : progress.day - 1;
  if (completed <= 0) return null;

  const dates = eachDay(cycle.start, cycle.end).slice(0, completed);
  let spentSoFar = 0;
  let noSpend = 0;
  let under = 0;
  let over = 0;
  for (const [i, date] of dates.entries()) {
    // The allowance as it stood at the START of this day: what was left of the ceiling then, spread
    // over the days remaining including this one. `?? 0` is unreachable — safeToSpendPerDay returns
    // null only for a null ceiling, guarded above — but it keeps the formula in one place, which is
    // the whole reason this calls the helper instead of re-deriving remaining/daysLeft.
    const target = safeToSpendPerDay(ceiling, spentSoFar, progress.total - i) ?? 0;
    const spend = spendByDate.get(date) ?? 0;
    if (spend <= 0) noSpend++;
    else if (spend <= target) under++;
    else over++;
    spentSoFar += spend;
  }
  return { noSpend, under, over, days: completed };
}
