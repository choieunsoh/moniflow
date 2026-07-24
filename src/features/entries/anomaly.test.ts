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

  it('excludes zero-spend cycles from the basis and ranks multiple anomalies by ratio', () => {
    const matrix = m({
      '2026-04': { Food: 1000, Fun: 500 },
      '2026-05': { Food: 1000, Fun: 500 },
      '2026-06': { Food: 0 }, // Food's zero here must NOT drag its average down
      '2026-07': { Food: 2000, Fun: 1500 },
    });
    // Food basis [1000,1000] (the 0 excluded) → avg 1000, ratio 2.0
    // Fun  basis [500,500]                    → avg 500,  ratio 3.0
    // sorted by ratio desc → Fun before Food
    expect(anomalies(matrix, '2026-07')).toEqual([
      { category: 'Fun', current: 1500, avg: 500, ratio: 3 },
      { category: 'Food', current: 2000, avg: 1000, ratio: 2 },
    ]);
  });

  it('flags a ratio exactly at the threshold (>= boundary)', () => {
    const matrix = m({
      '2026-05': { Food: 1000 },
      '2026-06': { Food: 1000 },
      '2026-07': { Food: 1500 }, // exactly 1.5× the 1000 average
    });
    expect(anomalies(matrix, '2026-07')).toEqual([
      { category: 'Food', current: 1500, avg: 1000, ratio: 1.5 },
    ]);
  });
});
