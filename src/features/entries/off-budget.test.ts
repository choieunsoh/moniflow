import { describe, it, expect } from 'vitest';
import { isOffBudget, splitBudgetSpend, discretionaryByCategory } from './off-budget';
import type { EntryRow } from './schema';

function row(
  amount: number,
  category: string,
  offBudget: number | null,
  currency: string | null = null,
): EntryRow {
  return {
    id: 1,
    date: '2026-07-20',
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency,
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
  const noTravel = new Set<string>();
  it('isOffBudget: entry override wins over category default (both directions)', () => {
    expect(isOffBudget(row(-1, 'Food', null), cats, noTravel)).toBe(false); // inherit, not off-budget cat
    expect(isOffBudget(row(-1, 'Insurance', null), cats, noTravel)).toBe(true); // inherit off-budget cat
    expect(isOffBudget(row(-1, 'Insurance', 0), cats, noTravel)).toBe(false); // force include overrides cat
    expect(isOffBudget(row(-1, 'Food', 1), cats, noTravel)).toBe(true); // force exclude in a normal cat
  });
  it('splitBudgetSpend returns magnitudes for discretionary vs off-budget', () => {
    const entries = [row(-600, 'Food', null), row(-12000, 'Insurance', null), row(-50, 'Food', 1)];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: 600,
      offBudget: 12050,
    });
  });
  it('discretionaryByCategory sums only non-off-budget entries, by category', () => {
    const entries = [row(-600, 'Food', null), row(-12000, 'Insurance', null), row(-50, 'Food', 1)];
    const m = discretionaryByCategory(entries, cats, noTravel);
    expect(m.get('Food')).toBe(600); // the -50 forced-exclude is dropped
    expect(m.has('Insurance')).toBe(false);
  });
});

describe('travel currencies', () => {
  const noCategories = new Set<string>();
  const travel = new Set(['JPY', 'HKD']);

  it('treats a travel-currency entry as off-budget', () => {
    const entry = row(-500, 'อาหาร', null, 'JPY');
    expect(isOffBudget(entry, noCategories, travel)).toBe(true);
  });

  it('leaves a non-travel foreign entry on budget', () => {
    const entry = row(-3647, 'บิลรายเดือน', null, 'USD');
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('leaves a THB entry on budget', () => {
    const entry = row(-100, 'อาหาร', null, 'THB');
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('treats a null currency as home currency', () => {
    const entry = row(-100, 'อาหาร', null, null);
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('lets an explicit per-entry 0 override the travel rule', () => {
    const entry = row(-500, 'อาหาร', 0, 'JPY');
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('lets an explicit per-entry 1 override an on-budget currency', () => {
    const entry = row(-500, 'อาหาร', 1, 'THB');
    expect(isOffBudget(entry, noCategories, travel)).toBe(true);
  });

  it('still falls through to the category default when nothing else applies', () => {
    const entry = row(-500, 'บิลรายปี', null, 'THB');
    expect(isOffBudget(entry, new Set(['บิลรายปี']), travel)).toBe(true);
  });

  it('splits a cycle containing both trip and home spend', () => {
    const entries = [row(-500, 'อาหาร', null, 'JPY'), row(-100, 'อาหาร', null, 'THB')];
    expect(splitBudgetSpend(entries, noCategories, travel)).toEqual({
      discretionary: 100,
      offBudget: 500,
    });
  });
});
