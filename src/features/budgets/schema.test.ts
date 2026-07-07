import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { budgets, ensureBudgetsTable } from './schema';

describe('budgets schema', () => {
  it('bootstraps a table that accepts a category row and a null-category (total) row', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    db.insert(budgets)
      .values([
        { category: 'food', amount: 5000 },
        { category: null, amount: 30000 },
      ])
      .run();
    const rows = db.select().from(budgets).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.category === null)?.amount).toBe(30000);
    expect(rows.find((r) => r.category === 'food')?.amount).toBe(5000);
  });
});
