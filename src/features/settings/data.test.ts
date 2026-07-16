import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureCategoriesTable, categories } from '@features/categories/schema';
import { ensureBudgetsTable, budgets } from '@features/budgets/schema';
import { ensureRecurrencesTable, recurrences } from '@features/recurring/schema';
import { insertEntry } from '@features/entries/queries';
import { setBudget } from '@features/budgets/queries';
import { addRule } from '@features/recurring/queries';
import { wipeAllData } from './data';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d);
  await ensureCategoriesTable(d);
  await ensureBudgetsTable(d);
  await ensureRecurrencesTable(d);
  return d;
}

describe('wipeAllData', () => {
  it('clears entries, categories, and budgets in one shot', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureBudgetsTable(db);
    await ensureRecurrencesTable(db);

    await insertEntry(db, { date: '2026-07-01', account: 'Cash', category: 'Coffee', amount: -80 });
    await insertEntry(db, {
      date: '2026-07-02',
      account: 'Card',
      category: 'Groceries',
      amount: -500,
    });
    await setBudget(db, 'Coffee', 1000);
    await setBudget(db, null, 20000); // the total-budget row

    expect(await db.select().from(entries).all()).toHaveLength(2);
    expect((await db.select().from(categories).all()).length).toBeGreaterThan(0);
    expect((await db.select().from(budgets).all()).length).toBeGreaterThan(0);

    await wipeAllData(db);

    expect(await db.select().from(entries).all()).toEqual([]);
    expect(await db.select().from(categories).all()).toEqual([]);
    expect(await db.select().from(budgets).all()).toEqual([]);
  });

  it('clears recurring rules too — otherwise the next sweep undoes the wipe', async () => {
    const d = await db();
    await addRule(d, {
      name: 'Rent',
      day: 1,
      intervalMonths: 1,
      accountId: 1,
      categoryId: 1,
      amount: 15000,
      currency: 'THB',
      startDate: '2026-07-01',
    });
    await wipeAllData(d);
    expect(await d.select().from(recurrences).all()).toEqual([]);
  });
});
