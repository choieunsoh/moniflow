import { desc, and, or, eq, gte, lte, lt, sql, isNotNull, ne, type AnyColumn } from 'drizzle-orm';
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

// ponytail: nets in JS over the full table — fine at scaffold scale. Upgrade to SQL aggregates
// (sum/count) if the ledger grows past what's cheap to load.
export function getNetFlow(db: Db): number {
  return getEntries(db).reduce((sum, r) => sum + r.amount, 0);
}

export type Summary = { net: number; inflow: number; outflow: number; count: number };

// Cycle rollup figures. inflow/outflow are split by sign; the home page uses only `count` today
// (to gate the empty state), but the split is kept for a caller that wants where money came from.
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

export type Breakdown = { key: string; total: number; count: number };

// moniflow is a spending tracker: cycle reads return expenses only (amount < 0), so the rare income
// row never lands in the summary, donut, records or day totals. Income stays in the DB (lossless
// import) but is out of scope for every UI surface. getCycleSummary derives from this, so it too is
// spending-only.
export function getEntriesInRange(db: Db, start: string, end: string): Entry[] {
  return db
    .select()
    .from(entries)
    .where(and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0)))
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
    .select({
      key: column,
      total: sql<number>`sum(${entries.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(entries)
    .where(and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0)))
    .groupBy(column)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export function getCategoryBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return groupSum(db, entries.category, start, end);
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

// Free-text search across the whole ledger (not cycle-scoped) — matches a substring of the note,
// category, or account, case-insensitively, expenses only (same spending-tracker scope as the cycle
// reads). Newest first. LIKE metacharacters in the query are escaped so a literal '_' or '%' can't
// widen the match. A blank query returns nothing rather than the whole ledger.
export function searchEntries(db: Db, query: string): Entry[] {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const has = (col: AnyColumn) => sql`${col} like ${pattern} escape '\\'`;
  return db
    .select()
    .from(entries)
    .where(
      and(
        lt(entries.amount, 0),
        or(has(entries.note), has(entries.category), has(entries.account)),
      ),
    )
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
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
