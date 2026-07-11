import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureBudgetsTable } from './schema';
import { getBudgets, setBudget, deleteBudget } from './queries';

function db() {
  const d = initDb(':memory:');
  ensureBudgetsTable(d);
  return d;
}

describe('budgets keyed by category_id, read back by name', () => {
  it('sets a per-category budget and a total, reads names back', () => {
    const d = db();
    setBudget(d, 'groceries', 3000);
    setBudget(d, null, 20000);
    const rows = getBudgets(d);
    expect(rows).toContainEqual(expect.objectContaining({ category: 'groceries', amount: 3000 }));
    expect(rows).toContainEqual(expect.objectContaining({ category: null, amount: 20000 }));
  });

  it('upserts by category (replaces the old amount, no duplicate row)', () => {
    const d = db();
    setBudget(d, 'groceries', 3000);
    setBudget(d, 'groceries', 3500);
    const grocery = getBudgets(d).filter((r) => r.category === 'groceries');
    expect(grocery).toHaveLength(1);
    expect(grocery[0].amount).toBe(3500);
  });

  it('deletes a per-category budget and the total independently', () => {
    const d = db();
    setBudget(d, 'groceries', 3000);
    setBudget(d, null, 20000);
    deleteBudget(d, 'groceries');
    expect(getBudgets(d).some((r) => r.category === 'groceries')).toBe(false);
    expect(getBudgets(d).some((r) => r.category === null)).toBe(true);
    deleteBudget(d, null);
    expect(getBudgets(d)).toHaveLength(0);
  });
});
