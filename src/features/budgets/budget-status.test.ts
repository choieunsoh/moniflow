import { describe, it, expect } from 'vitest';
import { toBudgetRows, toBudgetTotal } from './budget-status';

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

  it('orders attention-first: over → near → under → none', () => {
    expect(rows.map((r) => r.category)).toEqual(['Food', 'Fun', 'Rent', 'Health']);
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
