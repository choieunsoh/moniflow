// Pure dashboard math — the /dashboard screen's forward-looking figures. No DB, no React, tested in
// isolation. All spend/budget inputs are magnitudes (≥ 0); the ledger stores outflow negative, so
// callers pass Math.abs.

// A single early expense over the first day or two projects a wild full-cycle number, so the
// projection stays null until this many days have elapsed. Tunable in one place.
export const MIN_PROJECT_DAYS = 3;

// Remaining ceiling spread over the days left in the cycle (today inclusive). `ceiling` is the total
// budget ALREADY net of this cycle's whole fixed cost — recurring bills that have posted plus those
// still to come (use-home builds it; see off-budget/isFixed and recurring/committedThisCycle). It
// used to take those still-to-come bills as a separate `committed` argument, but once posted bills
// also came out of the budget the two had to be one figure: reserving the same bill through two
// arguments subtracts it twice on every day before it posts.
// null when no total budget is set — the caller shows the actual average instead. Floors at 0, which
// also covers a ceiling driven negative by fixed costs larger than the budget.
export function safeToSpendPerDay(
  ceiling: number | null,
  spent: number,
  daysLeft: number,
): number | null {
  if (ceiling === null) return null;
  const remaining = ceiling - spent;
  if (remaining <= 0) return 0;
  return remaining / Math.max(1, daysLeft);
}

// Actual spend per elapsed day — the fallback figure shown when no total budget exists.
export function averagePerDay(spent: number, daysElapsed: number): number {
  return spent / Math.max(1, daysElapsed);
}

// Linear pace projection of the full-cycle total: current daily rate × the cycle's length. null
// until MIN_PROJECT_DAYS have elapsed (too little signal to project from).
export function projectCycleTotal(
  spent: number,
  daysElapsed: number,
  cycleLength: number,
): number | null {
  if (daysElapsed < MIN_PROJECT_DAYS) return null;
  return (spent / daysElapsed) * cycleLength;
}

export type CycleDelta = { delta: number; direction: 'up' | 'down' | 'same'; prevTotal: number };

// This cycle's spend vs the previous cycle's. null when prevTotal is null — the hook passes null when
// there is no comparable earlier cycle (a day-one ledger), matching the honesty Analytics already
// applies to thin history. delta > 0 means you're spending MORE than last cycle.
export function cycleDelta(total: number, prevTotal: number | null): CycleDelta | null {
  if (prevTotal === null) return null;
  const delta = total - prevTotal;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  return { delta, direction, prevTotal };
}
