import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { budgets, ensureBudgetsTable } from './schema';

describe('budgets schema', () => {
  it('bootstraps a table that accepts a category_id row and a null-category_id (total) row', async () => {
    const db = makeNodeProxyDb();
    await ensureBudgetsTable(db);
    await db.insert(budgets)
      .values([
        { categoryId: 1, amount: 5000 },
        { categoryId: null, amount: 30000 },
      ])
      .run();
    const rows = await db.select().from(budgets).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.categoryId === null)?.amount).toBe(30000);
    expect(rows.find((r) => r.categoryId === 1)?.amount).toBe(5000);
  });
});
