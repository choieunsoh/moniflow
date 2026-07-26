import type { TrendBar } from './trend';
import type { BreakdownMatrix } from './breakdown-matrix';

export type ReportView = 'monthly' | 'yearly';

// One bucket of the window, already labelled. The fold stays view-agnostic: monthly passes cycles
// (label = the month), yearly passes years (label = the year), and neither shape leaks in here —
// which is why one fold serves both views instead of two that can drift apart.
export type ReportPeriod = { key: string; label: string; partial: boolean };

export type ReportCategory = { name: string; value: number; count: number };
export type ReportRow = { key: string; label: string; value: number; count: number };

export type CategoryReport = {
  bars: TrendBar[];
  total: number;
  // Unfiltered only — the picker list. Empty when a category is selected.
  categories: ReportCategory[];
  // Filtered only — the headline decomposed period by period. Empty when no category is selected,
  // so the two lists never both answer at once.
  rows: ReportRow[];
};

export function foldCategoryReport(
  matrix: BreakdownMatrix,
  periods: ReportPeriod[],
  category: string | null,
): CategoryReport {
  const bars: TrendBar[] = periods.map((p) => ({
    key: p.key,
    label: p.label,
    value: periodValue(matrix.get(p.key), category),
    partial: p.partial,
  }));

  return {
    bars,
    total: bars.reduce((sum, b) => sum + b.value, 0),
    categories: category === null ? rankCategories(matrix) : [],
    rows: category === null ? [] : toRows(matrix, periods, category),
  };
}

function periodValue(
  byCategory: Map<string, { value: number; count: number }> | undefined,
  category: string | null,
): number {
  if (byCategory === undefined) return 0;
  if (category !== null) return byCategory.get(category)?.value ?? 0;
  let sum = 0;
  for (const v of byCategory.values()) sum += v.value;
  return sum;
}

// Ranked over the WHOLE window, not over one period. The list is the picker, so its figure has to be
// the one the report headline will show when you tap through — a row that promises ฿48,200 and lands
// on ฿3,100 is the bug this page exists to avoid.
function rankCategories(matrix: BreakdownMatrix): ReportCategory[] {
  const totals = new Map<string, { value: number; count: number }>();
  for (const byCategory of matrix.values())
    for (const [name, v] of byCategory) {
      const cur = totals.get(name) ?? { value: 0, count: 0 };
      totals.set(name, { value: cur.value + v.value, count: cur.count + v.count });
    }
  return [...totals.entries()]
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

// Filtered: one row per period, so the list decomposes the headline and sums to the chart above it.
// Periods with no spend are KEPT — "you bought none of this in 2019" is the answer, and dropping
// them would leave the list shorter than the chart still draws in full.
function toRows(matrix: BreakdownMatrix, periods: ReportPeriod[], category: string): ReportRow[] {
  return periods.map((p) => {
    const hit = matrix.get(p.key)?.get(category);
    return { key: p.key, label: p.label, value: hit?.value ?? 0, count: hit?.count ?? 0 };
  });
}
