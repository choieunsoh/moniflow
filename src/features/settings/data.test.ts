import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureCategoriesTable, categories } from '@features/categories/schema';
import { ensureBudgetsTable, budgets } from '@features/budgets/schema';
import { insertEntry } from '@features/entries/queries';
import { setBudget } from '@features/budgets/queries';
import { wipeAllData } from './data';

describe('wipeAllData', () => {
  it('clears entries, categories, and budgets in one shot', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    ensureCategoriesTable(db);
    ensureBudgetsTable(db);

    insertEntry(db, { date: '2026-07-01', account: 'Cash', category: 'Coffee', amount: -80 });
    insertEntry(db, { date: '2026-07-02', account: 'Card', category: 'Groceries', amount: -500 });
    setBudget(db, 'Coffee', 1000);
    setBudget(db, null, 20000); // the total-budget row

    expect(db.select().from(entries).all()).toHaveLength(2);
    expect(db.select().from(categories).all().length).toBeGreaterThan(0);
    expect(db.select().from(budgets).all().length).toBeGreaterThan(0);

    wipeAllData(db);

    expect(db.select().from(entries).all()).toEqual([]);
    expect(db.select().from(categories).all()).toEqual([]);
    expect(db.select().from(budgets).all()).toEqual([]);
  });
});
