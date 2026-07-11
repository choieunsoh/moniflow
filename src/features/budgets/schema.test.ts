import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { budgets, ensureBudgetsTable } from './schema';

describe('budgets schema', () => {
  it('bootstraps a table that accepts a category_id row and a null-category_id (total) row', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    db.insert(budgets)
      .values([
        { categoryId: 1, amount: 5000 },
        { categoryId: null, amount: 30000 },
      ])
      .run();
    const rows = db.select().from(budgets).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.categoryId === null)?.amount).toBe(30000);
    expect(rows.find((r) => r.categoryId === 1)?.amount).toBe(5000);
  });
});
