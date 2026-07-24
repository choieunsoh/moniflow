import { describe, it, expect } from 'vitest';
import { anomalies } from './anomaly';

type Cell = { total: number; count: number };
function m(rows: Record<string, Record<string, number>>): Map<string, Map<string, Cell>> {
  return new Map(
    Object.entries(rows).map(([key, cats]) => [
      key,
      new Map(Object.entries(cats).map(([c, total]) => [c, { total, count: 1 }])),
    ]),
  );
}

describe('anomalies', () => {
  it('flags a category above threshold vs its own average across other cycles', () => {
    const matrix = m({
      '2026-04': { Food: 1000 },
      '2026-05': { Food: 1000 },
      '2026-06': { Food: 1000 },
      '2026-07': { Food: 2500 }, // 2.5x the 1000 average
    });
    expect(anomalies(matrix, '2026-07')).toEqual([
      { category: 'Food', current: 2500, avg: 1000, ratio: 2.5 },
    ]);
  });

  it('skips a category with fewer than two prior non-zero cycles', () => {
    const matrix = m({ '2026-06': { Rent: 5000 }, '2026-07': { Rent: 9000 } });
    expect(anomalies(matrix, '2026-07')).toEqual([]);
  });

  it('does not flag a category at or below threshold', () => {
    const matrix = m({
      '2026-05': { Food: 1000 },
      '2026-06': { Food: 1000 },
      '2026-07': { Food: 1400 },
    });
    expect(anomalies(matrix, '2026-07')).toEqual([]);
  });

  it('returns empty when the subject cycle is missing', () => {
    expect(anomalies(m({ '2026-06': { Food: 1000 } }), '2026-07')).toEqual([]);
  });
});
