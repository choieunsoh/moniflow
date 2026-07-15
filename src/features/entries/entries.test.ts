import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, entries } from './schema';
import { addEntries, getEntries } from './queries';

// Proves the feature is wired end-to-end through its public API: connection → table bootstrap →
// insert → typed read → signed net. Also exercises the @db/client path alias at runtime.
describe('entries feature (in-memory)', () => {
  it('round-trips signed money-flow entries and nets them', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await addEntries(db, [
      { date: '2026-07-01', account: 'cash', category: 'salary', amount: 50000 },
      { date: '2026-07-02', account: 'cash', category: 'rent', amount: -12000 },
    ]);

    const rows = await getEntries(db);
    expect(rows).toHaveLength(2);
    // Sums here rather than through a getNetFlow query: netting the whole table was only ever the
    // CLI's `summary` command, and it went with the CLI. The assertion still earns its place —
    // it proves the sign survives the round-trip, which is what the +/- fixture above is for.
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(38000);
  });

  it('stores original currency + amount alongside the THB amount', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await addEntries(db, [
      {
        date: '2026-07-01',
        account: 'jpy',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
      },
    ]);
    const [row] = await getEntries(db);
    expect(row.currency).toBe('JPY');
    expect(row.originalAmount).toBe(-1000);
    expect(row.amount).toBe(-230); // THB, the rollup basis
  });

  it('stores an optional time alongside the date', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await addEntries(db, [
      { date: '2026-07-06', time: '08:15', account: 'cash', category: 'coffee', amount: -80 },
      { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -60 }, // no time
    ]);
    const [withTime, withoutTime] = await getEntries(db);
    expect(withTime.time).toBe('08:15');
    expect(withoutTime.time).toBeNull();
  });
});

describe('ensureEntriesTable (id-keyed)', () => {
  it('creates entries with a category_id column and no category text column', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    // Raw sql passthrough (no query-builder `fields`) returns each row as an ARRAY of column
    // values (positional, unmapped) — PRAGMA table_info's columns are cid, name, type, notnull,
    // dflt_value, pk, so the name is index 1.
    const cols = (await db.all(sql`PRAGMA table_info(entries)`)).flatMap((r) =>
      Array.isArray(r) && typeof r[1] === 'string' ? [r[1]] : [],
    );
    expect(cols).toContain('category_id');
    expect(cols).not.toContain('category');
    await db
      .insert(entries)
      .values({ date: '2026-07-01', accountId: 1, categoryId: 1, amount: -5 })
      .run();
    expect(await db.select().from(entries).all()).toHaveLength(1);
  });
});
