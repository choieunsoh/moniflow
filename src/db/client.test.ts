import { describe, it, expect } from 'vitest';
import { initDb } from './client';
import { entries } from './schema';

// Proves the whole data stack is wired end-to-end: better-sqlite3 opens, drizzle wraps,
// the schema round-trips an insert → typed select, and signed amounts net correctly.
describe('initDb (in-memory)', () => {
  it('round-trips a money-flow entry', () => {
    const db = initDb(':memory:');
    db.insert(entries)
      .values([
        { date: '2026-07-01', account: 'cash', category: 'salary', amount: 50000 },
        { date: '2026-07-02', account: 'cash', category: 'rent', amount: -12000 },
      ])
      .run();

    const rows = db.select().from(entries).all();
    expect(rows).toHaveLength(2);
    const net = rows.reduce((sum, r) => sum + r.amount, 0);
    expect(net).toBe(38000);
  });
});
