import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

  // The ONE documented drift failure: schema.ts and worker.ts's BOOTSTRAP_SQL must agree.
  // Tests run against the Node shim (schema.ts), so only this guard or a browser catches it.
  // Checks every column's type + modifiers (not just its name), so a drifted DEFAULT, a flipped
  // NOT NULL, a type change, or a dropped column all fail this test.
  it('is present in the shipping BOOTSTRAP_SQL with every column, type, and modifier intact', () => {
    const worker = readFileSync('src/db/worker.ts', 'utf8');
    const match = /CREATE TABLE IF NOT EXISTS recurrences \(([^;]*?)\)\s*`/.exec(worker);
    expect(match).not.toBeNull();
    const body = match === null ? '' : match[1];
    const normalized = body.replace(/\s+/g, ' ').trim();
    for (const columnDef of [
      'id INTEGER PRIMARY KEY AUTOINCREMENT',
      'name TEXT NOT NULL',
      'day INTEGER NOT NULL',
      'interval_months INTEGER NOT NULL DEFAULT 1',
      'account_id INTEGER',
      'category_id INTEGER',
      'amount REAL NOT NULL',
      'currency TEXT',
      'rate REAL',
      'total_count INTEGER',
      'start_seq INTEGER NOT NULL DEFAULT 1',
      'start_date TEXT NOT NULL',
      'last_posted TEXT',
      'archived INTEGER NOT NULL DEFAULT 0',
    ]) {
      expect(normalized).toContain(columnDef);
    }
  });
});
