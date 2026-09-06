import type { EntryRow } from './schema';

// The single source of truth for "does this entry count against the budget?", in three tiers:
//   1. An explicit per-entry off_budget (0 or 1) always wins — that is the tri-state's whole job.
//   2. A travel currency means the entry was made abroad, and a trip is not this month's
//      discretionary spending. Derived, never stored: the currency column already says it, so a
//      second "is this a trip" flag would be the same duplication the category names used to carry.
//      Only currencies flagged off_budget count — USD/EUR/GBP here are online purchases.
//   3. Otherwise inherit the category default.
export function isOffBudget(
  entry: EntryRow,
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): boolean {
  if (entry.offBudget !== null && entry.offBudget !== undefined) return entry.offBudget === 1;
  if (entry.currency !== null && travelCurrencies.has(entry.currency)) return true;
  return offBudgetCategories.has(entry.category);
}

// Is this row a FIXED cost — a bill that posted itself from a standing rule rather than a choice
// made this cycle? Derived from `source`, which the sweep already stamps 'recurring' (recurring/
// queries.ts postRecurringEntries); no new column, and no per-entry tick to remember on the keypad.
// Deliberately narrower than "recurring": a bill you paid by hand instead of letting the rule post
// it is source 'manual' and counts as discretionary. That is the known ceiling of sourcing fixedness
// from the poster — upgrade path is a per-entry override in the shape off_budget already has.
export function isFixed(entry: EntryRow): boolean {
  return entry.source === 'recurring';
}

// Split a cycle's entries into discretionary / off-budget / fixed NET spend (the ledger stores
// outflows negative and inflows positive; negating makes an expense add and a refund subtract, so
// all three come back positive-as-spend). Feeds the budget meter/pace/safe-to-spend and the Home
// disclose lines. A side can go negative when a cycle's refunds exceed its spend — that is a true
// figure, not a bug.
//
// The two exclusions are NOT interchangeable and off-budget is checked first: off-budget drops a row
// from the meter's numerator AND leaves the ceiling alone ("don't judge my month by this"), while
// fixed drops it from the numerator and takes it OUT of the ceiling ("this money was never mine to
// spend"). A recurring bill sitting in an off-budget category has already been excluded by hand, so
// letting fixed win there would newly shrink a ceiling the user had deliberately left whole.
export function splitBudgetSpend(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): { discretionary: number; offBudget: number; fixed: number } {
  let discretionary = 0;
  let offBudget = 0;
  let fixed = 0;
  for (const e of entries) {
    const mag = -e.amount;
    if (isOffBudget(e, offBudgetCategories, travelCurrencies)) offBudget += mag;
    else if (isFixed(e)) fixed += mag;
    else discretionary += mag;
  }
  return { discretionary, offBudget, fixed };
}

// Per-category discretionary spend (off-budget AND fixed entries dropped) — the Budgets page feeds
// this to toBudgetRows so per-category meters match the Home total meter. Both exclusions have to be
// applied here, not just off-budget: the total meter's numerator is splitBudgetSpend's discretionary
// side, and the Budgets page sums THESE rows to build its own total. Drop only one of the two and
// the two surfaces quietly disagree by exactly the cycle's fixed spend.
export function discretionaryByCategory(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const e of entries) {
    if (isOffBudget(e, offBudgetCategories, travelCurrencies) || isFixed(e)) continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + -e.amount);
  }
  return byCat;
}

// Per-DAY discretionary spend (off-budget AND fixed entries dropped), keyed 'YYYY-MM-DD'. Same two
// exclusions as discretionaryByCategory above and for the same reason: dayPace grades each day
// against the ceiling the total meter uses, so it has to be counting the same money the meter does.
// A day whose refunds outweigh its spend comes back negative — a true figure, and dayPace reads it
// as "nothing left the wallet".
export function discretionaryByDate(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const e of entries) {
    if (isOffBudget(e, offBudgetCategories, travelCurrencies) || isFixed(e)) continue;
    byDate.set(e.date, (byDate.get(e.date) ?? 0) + -e.amount);
  }
  return byDate;
}
