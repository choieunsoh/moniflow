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

// Split a cycle's entries into discretionary vs off-budget NET spend (the ledger stores outflows
// negative and inflows positive; negating makes an expense add and a refund subtract, so both come
// back positive-as-spend). Feeds the budget meter/pace/safe-to-spend and the Home disclose line.
// A side can go negative when a cycle's refunds exceed its spend — that is a true figure, not a bug.
export function splitBudgetSpend(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): { discretionary: number; offBudget: number } {
  let discretionary = 0;
  let offBudget = 0;
  for (const e of entries) {
    const mag = -e.amount;
    if (isOffBudget(e, offBudgetCategories, travelCurrencies)) offBudget += mag;
    else discretionary += mag;
  }
  return { discretionary, offBudget };
}

// Per-category discretionary spend (off-budget entries dropped) — the Budgets page feeds this to
// toBudgetRows so per-category meters match the Home total meter.
export function discretionaryByCategory(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const e of entries) {
    if (isOffBudget(e, offBudgetCategories, travelCurrencies)) continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + -e.amount);
  }
  return byCat;
}
