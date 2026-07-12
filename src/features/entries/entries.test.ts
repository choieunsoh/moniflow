import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureEntriesTable, entries } from './schema';
import { addEntries, getEntries, getNetFlow } from './queries';

// Proves the feature is wired end-to-end through its public API: connection → table bootstrap →
// insert → typed read → signed net. Also exercises the @db/client path alias at runtime.
describe('entries feature (in-memory)', () => {
  it('round-trips signed money-flow entries and nets them', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'cash', category: 'salary', amount: 50000 },
      { date: '2026-07-02', account: 'cash', category: 'rent', amount: -12000 },
    ]);

    expect(getEntries(db)).toHaveLength(2);
    expect(getNetFlow(db)).toBe(38000);
  });

  it('stores original currency + amount alongside the THB amount', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      {
        date: '2026-07-01',
        account: 'jpy',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
      },
    ]);
    const [row] = getEntries(db);
    expect(row.currency).toBe('JPY');
    expect(row.originalAmount).toBe(-1000);
    expect(row.amount).toBe(-230); // THB, the rollup basis
  });

  it('stores an optional time alongside the date', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-06', time: '08:15', account: 'cash', category: 'coffee', amount: -80 },
      { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -60 }, // no time
    ]);
    const [withTime, withoutTime] = getEntries(db);
    expect(withTime.time).toBe('08:15');
    expect(withoutTime.time).toBeNull();
  });
});

describe('ensureEntriesTable (id-keyed)', () => {
  it('creates entries with a category_id column and no category text column', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    const cols = db
      .all(sql`PRAGMA table_info(entries)`)
      .flatMap((r) =>
        typeof r === 'object' && r !== null && 'name' in r && typeof r.name === 'string'
          ? [r.name]
          : [],
      );
    expect(cols).toContain('category_id');
    expect(cols).not.toContain('category');
    db.insert(entries)
      .values({ date: '2026-07-01', accountId: 1, categoryId: 1, amount: -5 })
      .run();
    expect(db.select().from(entries).all()).toHaveLength(1);
  });
});
