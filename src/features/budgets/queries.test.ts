import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureBudgetsTable } from './schema';
import { getBudgets, setBudget, deleteBudget } from './queries';

describe('budgets queries', () => {
  it('sets and reads a per-category budget', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    setBudget(db, 'food', 5000);
    const rows = getBudgets(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('food');
    expect(rows[0].amount).toBe(5000);
  });

  it('sets and reads the total budget under a null category', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    setBudget(db, null, 30000);
    const [row] = getBudgets(db);
    expect(row.category).toBeNull();
    expect(row.amount).toBe(30000);
  });

  it('upsert overwrites a category budget rather than duplicating it', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    setBudget(db, 'food', 5000);
    setBudget(db, 'food', 6000);
    const rows = getBudgets(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(6000);
  });

  it('upsert overwrites the total budget without touching category budgets', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    setBudget(db, 'food', 5000);
    setBudget(db, null, 30000);
    setBudget(db, null, 35000);
    const rows = getBudgets(db);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.category === null)?.amount).toBe(35000);
    expect(rows.find((r) => r.category === 'food')?.amount).toBe(5000);
  });

  it('deletes a category budget', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    setBudget(db, 'food', 5000);
    deleteBudget(db, 'food');
    expect(getBudgets(db)).toHaveLength(0);
  });

  it('deletes the total budget via a null category, leaving other budgets intact', () => {
    const db = initDb(':memory:');
    ensureBudgetsTable(db);
    setBudget(db, 'food', 5000);
    setBudget(db, null, 30000);
    deleteBudget(db, null);
    const rows = getBudgets(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('food');
  });
});
