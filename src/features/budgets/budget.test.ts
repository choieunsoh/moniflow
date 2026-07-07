import { describe, it, expect } from 'vitest';
import { toBudgetRows, totalBudgetRow, type SpentRow } from './budget';
import type { Budget } from './schema';

function budget(category: string | null, amount: number): Budget {
  return { id: 1, category, amount };
}

describe('toBudgetRows', () => {
  const spent: SpentRow[] = [
    { key: 'food', total: -4000 },
    { key: 'travel', total: -9000 },
  ];

  it('computes spend magnitude and pct against each category budget, sorted pct-descending', () => {
    const rows = toBudgetRows(spent, [budget('food', 5000), budget('travel', 6000)], 50);
    expect(rows).toEqual([
      { category: 'travel', budget: 6000, spent: 9000, pct: 150, overPace: true },
      { category: 'food', budget: 5000, spent: 4000, pct: 80, overPace: true },
    ]);
  });

  it('flags overPace only when pct exceeds the cycle-progress pct', () => {
    const rows = toBudgetRows([{ key: 'food', total: -1000 }], [budget('food', 5000)], 50);
    expect(rows[0]).toEqual({
      category: 'food',
      budget: 5000,
      spent: 1000,
      pct: 20,
      overPace: false,
    });
  });

  it('shows spent 0 for a budgeted category with no spend this cycle', () => {
    const rows = toBudgetRows([], [budget('rent', 12000)], 50);
    expect(rows).toEqual([{ category: 'rent', budget: 12000, spent: 0, pct: 0, overPace: false }]);
  });

  it('guards against a zero budget (no divide-by-zero)', () => {
    const rows = toBudgetRows([{ key: 'food', total: -1000 }], [budget('food', 0)], 50);
    expect(rows[0].pct).toBe(0);
    expect(rows[0].overPace).toBe(false);
  });

  it('ignores spend in categories without a budget', () => {
    const rows = toBudgetRows(
      [
        { key: 'food', total: -1000 },
        { key: 'unbudgeted', total: -500 },
      ],
      [budget('food', 5000)],
      50,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('food');
  });

  it('excludes the total (null-category) budget row from the per-category list', () => {
    const rows = toBudgetRows(spent, [budget(null, 30000), budget('food', 5000)], 50);
    expect(rows).toEqual([
      { category: 'food', budget: 5000, spent: 4000, pct: 80, overPace: true },
    ]);
  });
});

describe('totalBudgetRow', () => {
  it('computes the total row when a total budget is set', () => {
    const row = totalBudgetRow(35000, [budget(null, 30000), budget('food', 5000)], 50);
    expect(row).toEqual({
      budget: 30000,
      spent: 35000,
      pct: (35000 / 30000) * 100,
      overPace: true,
    });
  });

  it('returns null when no total budget is set', () => {
    expect(totalBudgetRow(1000, [budget('food', 5000)], 50)).toBeNull();
  });
});
