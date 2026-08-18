import { describe, it, expect } from 'vitest';
import { isOffBudget, splitBudgetSpend, discretionaryByCategory } from './off-budget';
import type { EntryRow } from './schema';

function row(
  amount: number,
  category: string,
  offBudget: number | null,
  currency: string | null = null,
  source = 'manual',
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
    source,
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
      fixed: 0,
    });
  });
  it('discretionaryByCategory sums only non-off-budget entries, by category', () => {
    const entries = [row(-600, 'Food', null), row(-12000, 'Insurance', null), row(-50, 'Food', 1)];
    const m = discretionaryByCategory(entries, cats, noTravel);
    expect(m.get('Food')).toBe(600); // the -50 forced-exclude is dropped
    expect(m.has('Insurance')).toBe(false);
  });
  it('splitBudgetSpend nets a refund against spend in the same category', () => {
    const entries = [row(-2000, 'Food', null), row(500, 'Food', null)];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: 1500,
      offBudget: 0,
      fixed: 0,
    });
  });
  it('splitBudgetSpend keeps a refund on the same side as the spend it refunds', () => {
    // An inflow in an off-budget category reduces the off-budget side, not the discretionary side.
    const entries = [row(-12000, 'Insurance', null), row(2000, 'Insurance', null)];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: 0,
      offBudget: 10000,
      fixed: 0,
    });
  });
  it('discretionaryByCategory nets a refund within its category', () => {
    const entries = [row(-600, 'Food', null), row(100, 'Food', null)];
    expect(discretionaryByCategory(entries, cats, noTravel)).toEqual(new Map([['Food', 500]]));
  });
});

// A self-posted recurring bill is a FIXED cost: not a choice made this cycle, so it leaves the
// discretionary side — but unlike off-budget it is still real money that must come out of the
// ceiling (use-home folds it in), which is why it needs its own bucket rather than joining offBudget.
describe('fixed (recurring-sourced) spend', () => {
  const cats = new Set(['Insurance']);
  const noTravel = new Set<string>();

  it('splitBudgetSpend routes a recurring entry to fixed, not discretionary', () => {
    const entries = [row(-600, 'Food', null), row(-1720, 'Bills', null, null, 'recurring')];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: 600,
      offBudget: 0,
      fixed: 1720,
    });
  });

  it('off-budget wins over fixed — an already-excluded bill must not also shrink the ceiling', () => {
    // Both tiers claim this row. off-budget is the stronger statement ("ignore this entirely"), and
    // letting fixed win would newly deduct from the ceiling a bill the user had already excluded.
    const entries = [
      row(-12000, 'Insurance', null, null, 'recurring'), // off-budget CATEGORY
      row(-900, 'Bills', 1, null, 'recurring'), // per-entry force-exclude
    ];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: 0,
      offBudget: 12900,
      fixed: 0,
    });
  });

  it('a travel-currency recurring bill stays off-budget', () => {
    const travel = new Set(['JPY']);
    const entries = [row(-5000, 'Bills', null, 'JPY', 'recurring')];
    expect(splitBudgetSpend(entries, new Set<string>(), travel)).toEqual({
      discretionary: 0,
      offBudget: 5000,
      fixed: 0,
    });
  });

  it('a hand-entered refund of a fixed bill lands discretionary, and still nets right', () => {
    // The bucket is chosen by `source`, and a refund is always typed by hand — so it goes to the
    // discretionary side as a negative rather than reducing `fixed`. The arithmetic still works out:
    // ceiling 50000 − 1720 = 48280, less discretionary −220 → 48500 remaining, exactly the 1500 the
    // bill really cost. The split is cosmetic; the remainder is what the user acts on.
    const entries = [row(-1720, 'Bills', null, null, 'recurring'), row(220, 'Bills', null)];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: -220,
      offBudget: 0,
      fixed: 1720,
    });
  });

  it('discretionaryByCategory drops recurring rows so per-category meters match the total', () => {
    const entries = [row(-300, 'Bills', null), row(-1720, 'Bills', null, null, 'recurring')];
    expect(discretionaryByCategory(entries, cats, noTravel)).toEqual(new Map([['Bills', 300]]));
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
      fixed: 0,
    });
  });
});
