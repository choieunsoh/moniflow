import type { Db } from '@db/client';
import { getCategoryBreakdown } from './queries';

// A span the matrix is built over — one cycle, or a whole year. `Cycle` satisfies this structurally,
// so /month can hand its cycles straight in without a mapping step.
export type BreakdownWindow = { key: string; start: string; end: string };

// window key → category → { value, count }. THE primitive behind every category-over-time surface:
// unfiltered a view sums a row, filtered it reads one column. Values are MAGNITUDES — totals arrive
// negative (the ledger's sign) and every read surface in this app shows spend.
export type BreakdownMatrix = Map<string, Map<string, { value: number; count: number }>>;

// ponytail: one bounded aggregate per window rather than a single windowed query — a window boundary
// is a cutoff-day concept computed in cycle.ts, not something SQL knows, so one statement would need
// a CASE ladder or raw-row bucketing that defeats the GROUP BY. A dozen aggregates against local
// OPFS is cheap; the alternative is loading a decade of rows to use a twelfth of them. Collapse it
// if a slow device ever makes it felt.
export async function buildBreakdownMatrix(
  db: Db,
  windows: BreakdownWindow[],
): Promise<BreakdownMatrix> {
  const breakdowns = await Promise.all(
    windows.map((w) => getCategoryBreakdown(db, w.start, w.end)),
  );
  const matrix: BreakdownMatrix = new Map();
  for (const [i, rows] of breakdowns.entries()) {
    const byCategory = new Map<string, { value: number; count: number }>();
    for (const row of rows)
      byCategory.set(row.key, { value: Math.abs(row.total), count: row.count });
    matrix.set(windows[i].key, byCategory);
  }
  return matrix;
}
