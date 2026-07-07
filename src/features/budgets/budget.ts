import type { Budget } from './schema';

// Structurally compatible with @features/entries/queries' Breakdown ({ key, total }). Declared
// locally instead of imported so budgets has no compile-time dependency on the entries feature —
// callers passing entries' Breakdown[] type-check anyway (structural typing).
export type SpentRow = { key: string; total: number };

export type BudgetRow = {
  category: string;
  budget: number;
  spent: number;
  pct: number;
  overPace: boolean;
};

// Per-category budget-vs-spend rows for the dashboard tracker, sorted worst-pace first. `spent`
// breakdown magnitudes arrive negative (spending); budgets are the positive comparison basis. A
// budgeted category with no matching spend this cycle shows spent 0. A category with spend but no
// budget is simply absent — only budgeted categories get a row (no "unbudgeted" aggregate; keeping
// v1 simple was a deliberate call). The null-category (total) budget is excluded here — see
// totalBudgetRow below.
export function toBudgetRows(
  spent: SpentRow[],
  budgets: Budget[],
  progressPct: number,
): BudgetRow[] {
  const spentByCategory = new Map<string, number>();
  for (const row of spent) {
    spentByCategory.set(row.key, (spentByCategory.get(row.key) ?? 0) + Math.abs(row.total));
  }

  const rows = budgets
    .filter((b): b is Budget & { category: string } => b.category !== null)
    .map((b) => {
      const spentAmount = spentByCategory.get(b.category) ?? 0;
      const pct = b.amount === 0 ? 0 : (spentAmount / b.amount) * 100;
      return {
        category: b.category,
        budget: b.amount,
        spent: spentAmount,
        pct,
        overPace: pct > progressPct,
      };
    });

  return rows.sort((a, b) => b.pct - a.pct);
}

export type TotalRow = { budget: number; spent: number; pct: number; overPace: boolean };

// The whole-cycle budget row, or null if no total budget is set. `totalSpent` is supplied by the
// caller (the cycle's Math.abs(summary.outflow)) rather than computed here, so this stays pure
// with no query dependency.
export function totalBudgetRow(
  totalSpent: number,
  budgets: Budget[],
  progressPct: number,
): TotalRow | null {
  const total = budgets.find((b) => b.category === null);
  if (!total) return null;
  const pct = total.amount === 0 ? 0 : (totalSpent / total.amount) * 100;
  return { budget: total.amount, spent: totalSpent, pct, overPace: pct > progressPct };
}
