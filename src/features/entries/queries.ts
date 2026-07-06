import { desc, and, gte, lte, sql } from 'drizzle-orm';
import type { Db } from '@db/client';
import { entries, type Entry, type NewEntry } from './schema';

// Typed reads/writes for the entries feature. Server Components and the CLI call these directly
// — no API layer. Column selections infer row types, so no `as` casts are needed.
export function addEntries(db: Db, rows: NewEntry[]): void {
  db.insert(entries).values(rows).run();
}

export function getEntries(db: Db): Entry[] {
  return db.select().from(entries).all();
}

export function getRecentEntries(db: Db, limit = 8): Entry[] {
  return db.select().from(entries).orderBy(desc(entries.date), desc(entries.id)).limit(limit).all();
}

// ponytail: nets in JS over the full table — fine at scaffold scale. Upgrade to SQL aggregates
// (sum/count) if the ledger grows past what's cheap to load.
export function getNetFlow(db: Db): number {
  return getEntries(db).reduce((sum, r) => sum + r.amount, 0);
}

export type Summary = { net: number; inflow: number; outflow: number; count: number };

// Headline figures for the dashboard summary bar. inflow/outflow are split by sign so the UI
// can show where money came from vs went, not just the net.
function summarize(rows: Entry[]): Summary {
  return rows.reduce<Summary>(
    (acc, r) => ({
      net: acc.net + r.amount,
      inflow: acc.inflow + (r.amount > 0 ? r.amount : 0),
      outflow: acc.outflow + (r.amount < 0 ? r.amount : 0),
      count: acc.count + 1,
    }),
    { net: 0, inflow: 0, outflow: 0, count: 0 },
  );
}

export function getSummary(db: Db): Summary {
  return summarize(getEntries(db));
}

// Truncate-then-insert: the Monefy import replaces the whole ledger from an immutable export.
// Chunked inside a transaction — a 10k-row export would blow past SQLite's bound-variable limit in
// a single insert, and the delete + inserts must be atomic so a failure can't leave a half ledger.
// ponytail: safe while there is no write path. When the add-entry slice lands, add a `source`
// column and delete only where source='monefy' so hand-entered rows survive.
export function replaceEntries(db: Db, rows: NewEntry[]): void {
  const chunkSize = 500; // 500 rows × 7 bound columns stays well under SQLite's variable cap
  db.transaction((tx) => {
    tx.delete(entries).run();
    for (let i = 0; i < rows.length; i += chunkSize) {
      tx.insert(entries)
        .values(rows.slice(i, i + chunkSize))
        .run();
    }
  });
}

export type Breakdown = { key: string; total: number };

export function getEntriesInRange(db: Db, start: string, end: string): Entry[] {
  return db
    .select()
    .from(entries)
    .where(and(gte(entries.date, start), lte(entries.date, end)))
    .all();
}

export function getCycleSummary(db: Db, start: string, end: string): Summary {
  return summarize(getEntriesInRange(db, start, end));
}

// GROUP BY in SQL so a cycle view never loads the full 10-year ledger. Sorted by magnitude in JS
// (the result set is at most one row per category/account — tiny).
function groupSum(
  db: Db,
  column: typeof entries.category | typeof entries.account,
  start: string,
  end: string,
): Breakdown[] {
  return db
    .select({ key: column, total: sql<number>`sum(${entries.amount})` })
    .from(entries)
    .where(and(gte(entries.date, start), lte(entries.date, end)))
    .groupBy(column)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export function getCategoryBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return groupSum(db, entries.category, start, end);
}

export function getAccountBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return groupSum(db, entries.account, start, end);
}
