import { describe, it, expect } from 'vitest';
import { toBudgetRows, toBudgetTotal, suggestBudget } from './budget-status';

describe('suggestBudget', () => {
  it('rounds up to the nearest 500 for amounts ≥ ฿1,000', () => {
    expect(suggestBudget(8918)).toBe(9000);
    expect(suggestBudget(5388)).toBe(5500);
    expect(suggestBudget(1000)).toBe(1000); // already a clean step
  });

  it('rounds up to the nearest 100 for small amounts', () => {
    expect(suggestBudget(140)).toBe(200);
    expect(suggestBudget(553)).toBe(600);
  });

  it('returns null when there is no spend to base it on', () => {
    expect(suggestBudget(0)).toBeNull();
    expect(suggestBudget(-50)).toBeNull();
  });
});

describe('toBudgetTotal', () => {
  it('classifies under / near / over against the limit', () => {
    expect(toBudgetTotal(1000, 500).state).toBe('under');
    expect(toBudgetTotal(1000, 800).state).toBe('near'); // exactly the 80% threshold
    expect(toBudgetTotal(1000, 1001).state).toBe('over');
  });

  it('reports remaining as limit − spent (negative when over)', () => {
    expect(toBudgetTotal(1000, 300).remaining).toBe(700);
    expect(toBudgetTotal(1000, 1200).remaining).toBe(-200);
  });

  it('clamps the meter to 100% even when over budget', () => {
    expect(toBudgetTotal(1000, 4000).pct).toBe(100);
  });

  it('treats a missing limit as unbudgeted (no state, no remaining)', () => {
    const t = toBudgetTotal(null, 500);
    expect(t.state).toBe('none');
    expect(t.remaining).toBe(0);
    expect(t.pct).toBe(100); // spend with no budget fills the neutral bar
  });
});

describe('toBudgetRows', () => {
  const rows = toBudgetRows(
    ['Food', 'Rent', 'Fun', 'Health'],
    new Map([
      ['Food', 1000], // over
      ['Rent', 5000], // under
      ['Fun', 200], // near (160/200 = 80%)
      // Health has no budget
    ]),
    new Map([
      ['Food', 1500],
      ['Rent', 1000],
      ['Fun', 160],
      ['Health', 300], // spend with no budget → 'none'
    ]),
  );

  it('orders by spend, biggest first (stable as budgets are set)', () => {
    // spend: Food 1500, Rent 1000, Health 300, Fun 160
    expect(rows.map((r) => r.category)).toEqual(['Food', 'Rent', 'Health', 'Fun']);
  });

  it('includes a budgeted category with no spend this cycle', () => {
    const noSpend = toBudgetRows(['Idle'], new Map([['Idle', 500]]), new Map());
    expect(noSpend).toHaveLength(1);
    expect(noSpend[0]).toMatchObject({ category: 'Idle', spent: 0, state: 'under' });
  });

  it('surfaces untracked spend (spent, no budget) as its own state', () => {
    const health = rows.find((r) => r.category === 'Health');
    expect(health).toMatchObject({ limit: null, spent: 300, state: 'none' });
  });

  it('lists each category once even when it appears in every source', () => {
    expect(new Set(rows.map((r) => r.category)).size).toBe(rows.length);
  });
});
