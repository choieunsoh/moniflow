import { describe, it, expect } from 'vitest';
import { deltaByCategory } from './delta-breakdown';

type Cell = { total: number; count: number };
// Matrix builder — totals are magnitudes, mirroring use-analytics.
function m(rows: Record<string, Record<string, number>>): Map<string, Map<string, Cell>> {
  return new Map(
    Object.entries(rows).map(([key, cats]) => [
      key,
      new Map(Object.entries(cats).map(([c, total]) => [c, { total, count: 1 }])),
    ]),
  );
}

describe('deltaByCategory', () => {
  it('ranks increases and decreases by magnitude, positive = spent more', () => {
    const matrix = m({
      '2026-06': { Food: 1000, Transport: 800, Fun: 300 },
      '2026-07': { Food: 1420, Transport: 600, Fun: 300 },
    });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([
      { category: 'Food', delta: 420 },
      { category: 'Transport', delta: -200 },
    ]);
  });

  it('treats a category new this cycle as a full increase', () => {
    const matrix = m({ '2026-06': { Food: 1000 }, '2026-07': { Food: 1000, Rent: 5000 } });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([
      { category: 'Rent', delta: 5000 },
    ]);
  });

  it('treats a category dropped this cycle as a full decrease', () => {
    const matrix = m({ '2026-06': { Food: 1000, Gym: 700 }, '2026-07': { Food: 1000 } });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([
      { category: 'Gym', delta: -700 },
    ]);
  });

  it('omits zero-net categories and breaks ties by name', () => {
    const matrix = m({
      '2026-06': { A: 100, B: 500, C: 999 },
      '2026-07': { A: 300, B: 700, C: 999 }, // A +200, B +200 (tie), C unchanged (omit)
    });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([
      { category: 'A', delta: 200 },
      { category: 'B', delta: 200 },
    ]);
  });

  it('returns empty when a cycle is missing', () => {
    expect(deltaByCategory(m({ '2026-07': { Food: 100 } }), '2026-07', '2026-06')).toEqual([]);
  });
});
