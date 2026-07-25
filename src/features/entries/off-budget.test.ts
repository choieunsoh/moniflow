import { describe, it, expect } from 'vitest';
import { isOffBudget, splitBudgetSpend, discretionaryByCategory } from './off-budget';
import type { EntryRow } from './schema';

function row(amount: number, category: string, offBudget: number | null): EntryRow {
  return {
    id: 1,
    date: '2026-07-20',
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget,
    category,
    account: 'Cash',
  };
}

describe('off-budget rules', () => {
  const cats = new Set(['Insurance']);
  it('isOffBudget: entry override wins over category default (both directions)', () => {
    expect(isOffBudget(row(-1, 'Food', null), cats)).toBe(false); // inherit, not off-budget cat
    expect(isOffBudget(row(-1, 'Insurance', null), cats)).toBe(true); // inherit off-budget cat
    expect(isOffBudget(row(-1, 'Insurance', 0), cats)).toBe(false); // force include overrides cat
    expect(isOffBudget(row(-1, 'Food', 1), cats)).toBe(true); // force exclude in a normal cat
  });
  it('splitBudgetSpend returns magnitudes for discretionary vs off-budget', () => {
    const entries = [row(-600, 'Food', null), row(-12000, 'Insurance', null), row(-50, 'Food', 1)];
    expect(splitBudgetSpend(entries, cats)).toEqual({ discretionary: 600, offBudget: 12050 });
  });
  it('discretionaryByCategory sums only non-off-budget entries, by category', () => {
    const entries = [row(-600, 'Food', null), row(-12000, 'Insurance', null), row(-50, 'Food', 1)];
    const m = discretionaryByCategory(entries, cats);
    expect(m.get('Food')).toBe(600); // the -50 forced-exclude is dropped
    expect(m.has('Insurance')).toBe(false);
  });
});
