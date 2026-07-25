import type { EntryRow } from './schema';

// The single source of truth for "does this entry count against the budget?" Per-entry off_budget wins
// (null = inherit the category default). See the off-budget spend spec.
export function isOffBudget(entry: EntryRow, offBudgetCategories: Set<string>): boolean {
  const effective = entry.offBudget ?? (offBudgetCategories.has(entry.category) ? 1 : 0);
  return effective === 1;
}

// Split a cycle's entries into discretionary vs off-budget spend magnitudes (the ledger stores outflows
// negative; both are returned positive). Feeds the budget meter/pace/safe-to-spend and the Home disclose line.
export function splitBudgetSpend(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
): { discretionary: number; offBudget: number } {
  let discretionary = 0;
  let offBudget = 0;
  for (const e of entries) {
    const mag = Math.abs(e.amount);
    if (isOffBudget(e, offBudgetCategories)) offBudget += mag;
    else discretionary += mag;
  }
  return { discretionary, offBudget };
}

// Per-category discretionary spend (off-budget entries dropped) — the Budgets page feeds this to
// toBudgetRows so per-category meters match the Home total meter.
export function discretionaryByCategory(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const e of entries) {
    if (isOffBudget(e, offBudgetCategories)) continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + Math.abs(e.amount));
  }
  return byCat;
}
