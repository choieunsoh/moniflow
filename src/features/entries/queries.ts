import { desc, and, eq, gte, lte, sql, isNotNull, ne } from 'drizzle-orm';
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
  return db
    .select()
    .from(entries)
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .limit(limit)
    .all();
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

// Replace the imported ledger from an immutable Monefy export, leaving hand-entered ('manual')
// rows untouched — only 'monefy'-sourced rows are cleared. Chunked inside a transaction: a single
// insert of the ~10.7k-row export exceeds SQLite's bound-variable cap, and delete + inserts must
// be atomic so a failure can't leave a half ledger.
export function replaceEntries(db: Db, rows: NewEntry[]): void {
  const chunkSize = 500; // 500 rows × bound columns stays well under SQLite's variable cap
  db.transaction((tx) => {
    tx.delete(entries).where(eq(entries.source, 'monefy')).run();
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

export function insertEntry(db: Db, entry: NewEntry): void {
  db.insert(entries).values(entry).run();
}

export function updateEntry(db: Db, id: number, entry: NewEntry): void {
  db.update(entries).set(entry).where(eq(entries.id, id)).run();
}

export function deleteEntry(db: Db, id: number): void {
  db.delete(entries).where(eq(entries.id, id)).run();
}

export function getEntryById(db: Db, id: number): Entry | undefined {
  return db.select().from(entries).where(eq(entries.id, id)).get();
}

export function getDistinctCategories(db: Db): string[] {
  return db
    .selectDistinct({ category: entries.category })
    .from(entries)
    .orderBy(entries.category)
    .all()
    .map((r) => r.category);
}

export function getDistinctAccounts(db: Db): string[] {
  return db
    .selectDistinct({ account: entries.account })
    .from(entries)
    .orderBy(entries.account)
    .all()
    .map((r) => r.account);
}

export type CategoryCount = { category: string; count: number };

// Category cleanup surface: how many rows sit in each category, so the biggest fragments are
// obvious before a rename/merge. Grouped in SQL; sorted by count in JS — same pattern as
// groupSum above, since the result set is at most one row per distinct category, tiny even over
// a decade of data.
export function getCategoryCounts(db: Db): CategoryCount[] {
  return db
    .select({ category: entries.category, count: sql<number>`count(*)` })
    .from(entries)
    .groupBy(entries.category)
    .all()
    .sort((a, b) => b.count - a.count);
}

// Whole-ledger category rename. If `to` already exists, matching rows fold into it automatically
// — a merge, not a separate code path. No-op-safe: only rows where category = `from` are
// touched, so renaming a category that doesn't exist updates zero rows.
export function renameCategory(db: Db, from: string, to: string): void {
  db.update(entries).set({ category: to }).where(eq(entries.category, from)).run();
}

// Foreign-currency rows for the trip view — anything not THB (and not null, which covers legacy
// or bad-import rows). Ordered by date then id so groupIntoTrips can walk it as one chronological
// pass without needing to trust the caller's ordering.
export function getForeignEntries(db: Db): Entry[] {
  return db
    .select()
    .from(entries)
    .where(and(isNotNull(entries.currency), ne(entries.currency, 'THB')))
    .orderBy(entries.date, entries.id)
    .all();
}
