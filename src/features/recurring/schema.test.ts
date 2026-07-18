import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureRecurrencesTable, recurrences } from './schema';
import { categories } from '@features/categories/schema';
import { accounts } from '@features/accounts/schema';

async function db() {
  const d = makeNodeProxyDb();
  await ensureRecurrencesTable(d);
  return d;
}

describe('recurrences table', () => {
  it('round-trips a rule with its nullable columns', async () => {
    const d = await db();
    await d
      .insert(recurrences)
      .values({
        name: 'Netflix',
        day: 5,
        intervalMonths: 1,
        accountId: 1,
        categoryId: 2,
        amount: 9.99,
        currency: 'USD',
        rate: null,
        totalCount: null,
        startSeq: 1,
        startDate: '2026-07-05',
        lastPosted: null,
      })
      .run();
    const rows = await d.select().from(recurrences).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Netflix',
      day: 5,
      intervalMonths: 1,
      amount: 9.99,
      currency: 'USD',
      rate: null,
      totalCount: null,
      startSeq: 1,
      startDate: '2026-07-05',
      lastPosted: null,
      archived: 0,
    });
  });

  it('ensures its FK tables, so calling it alone yields a queryable rule', async () => {
    const d = await db();
    // ensureRecurrencesTable must bootstrap categories + accounts like ensureEntriesTable does
    await expect(d.select().from(recurrences).all()).resolves.toEqual([]);
    await expect(d.select().from(categories).all()).resolves.toEqual([]);
    await expect(d.select().from(accounts).all()).resolves.toEqual([]);
  });

  // The BOOTSTRAP_SQL lockstep check that used to live here (a hand-written copy of all 14 column
  // definitions — a third place for the schema to drift) is now src/db/schema-lockstep.test.ts,
  // which diffs sqlite's own PRAGMA output for all seven tables instead.
});
