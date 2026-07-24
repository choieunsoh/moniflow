export type Anomaly = { category: string; current: number; avg: number; ratio: number };

type Cell = { total: number; count: number };

// Categories whose spend in the subject cycle stands out against their OWN history. The basis for
// each category is that category's spend in the window's other cycles, excluding zeros — a zero in
// the analytics window means "not tracking yet / no spend", and averaging it in would fake a spike
// (the same exclusion trend.completeBars applies to the average line). Needs at least two such
// cycles or the category has no "normal" yet and is skipped. Sorted worst-ratio first so the caller
// can show only the top offenders.
export function anomalies(
  matrix: Map<string, Map<string, Cell>>,
  subjectKey: string,
  threshold = 1.5,
): Anomaly[] {
  const subject = matrix.get(subjectKey);
  if (subject === undefined) return [];
  const out: Anomaly[] = [];
  for (const [category, cell] of subject) {
    const current = cell.total;
    if (current <= 0) continue;
    const basis: number[] = [];
    for (const [key, byCategory] of matrix) {
      if (key === subjectKey) continue;
      const v = byCategory.get(category)?.total ?? 0;
      if (v > 0) basis.push(v);
    }
    if (basis.length < 2) continue;
    const avg = basis.reduce((sum, v) => sum + v, 0) / basis.length;
    const ratio = current / avg;
    if (ratio >= threshold) out.push({ category, current, avg, ratio });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}
