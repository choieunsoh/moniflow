import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeNodeProxyDb } from '@db/client';
import { ensureRecurrencesTable, recurrences } from './schema';

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
  });

  // The ONE documented drift failure: schema.ts and worker.ts's BOOTSTRAP_SQL must agree.
  // Tests run against the Node shim (schema.ts), so only this guard or a browser catches it.
  it('is present in the shipping BOOTSTRAP_SQL', () => {
    const worker = readFileSync('src/db/worker.ts', 'utf8');
    expect(worker).toMatch(/CREATE TABLE IF NOT EXISTS recurrences/);
    for (const col of [
      'interval_months',
      'total_count',
      'start_seq',
      'start_date',
      'last_posted',
    ]) {
      expect(worker).toContain(col);
    }
  });
});
