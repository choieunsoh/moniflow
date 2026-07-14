import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureBudgetsTable } from './schema';
import { getBudgets, setBudget, deleteBudget } from './queries';

async function db() {
  const d = makeNodeProxyDb();
  await ensureCategoriesTable(d);
  await ensureBudgetsTable(d);
  return d;
}

describe('budgets keyed by category_id, read back by name', () => {
  it('sets a per-category budget and a total, reads names back', async () => {
    const d = await db();
    await setBudget(d, 'groceries', 3000);
    await setBudget(d, null, 20000);
    const rows = await getBudgets(d);
    expect(rows).toContainEqual(expect.objectContaining({ category: 'groceries', amount: 3000 }));
    expect(rows).toContainEqual(expect.objectContaining({ category: null, amount: 20000 }));
  });

  it('upserts by category (replaces the old amount, no duplicate row)', async () => {
    const d = await db();
    await setBudget(d, 'groceries', 3000);
    await setBudget(d, 'groceries', 3500);
    const rows = await getBudgets(d);
    const grocery = rows.filter((r) => r.category === 'groceries');
    expect(grocery).toHaveLength(1);
    expect(grocery[0].amount).toBe(3500);
  });

  it('deletes a per-category budget and the total independently', async () => {
    const d = await db();
    await setBudget(d, 'groceries', 3000);
    await setBudget(d, null, 20000);
    await deleteBudget(d, 'groceries');
    expect((await getBudgets(d)).some((r) => r.category === 'groceries')).toBe(false);
    expect((await getBudgets(d)).some((r) => r.category === null)).toBe(true);
    await deleteBudget(d, null);
    expect(await getBudgets(d)).toHaveLength(0);
  });

  it('deleting an unknown category is a no-op, leaves existing budgets intact', async () => {
    const d = await db();
    await setBudget(d, 'groceries', 3000);
    await deleteBudget(d, 'nonexistent');
    expect((await getBudgets(d)).some((r) => r.category === 'groceries')).toBe(true);
  });
});
