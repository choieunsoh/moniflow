import {
  desc,
  and,
  or,
  eq,
  gte,
  lte,
  lt,
  sql,
  isNotNull,
  ne,
  getTableColumns,
  type AnyColumn,
} from 'drizzle-orm';
import type { Db } from '@db/client';
import { entries, tripTitles, type EntryRow, type EntryInput } from './schema';
import { categories } from '@features/categories/schema';
import { categoryIdFor } from '@features/categories/queries';
import { budgets } from '@features/budgets/schema';
import { accounts } from '@features/accounts/schema';
import { accountIdFor, FALLBACK_ICON } from '@features/accounts/queries';

// Typed reads/writes for the entries feature. Server Components and the CLI call these directly
// — no API layer. Column selections infer row types, so no `as` casts are needed.

// Every read that returns entries for the UI projects this shape: the stored columns plus the joined
// category + account NAMEs. getTableColumns keeps it in lockstep with the schema — a new entries
// column can't be silently dropped from reads. innerJoin because every entry has a category_id and an
// account_id after migration and on every write.
const entryRowColumns = {
  ...getTableColumns(entries),
  category: categories.name,
  account: accounts.name,
};

function entryRowsQuery(db: Db) {
  return db
    .select(entryRowColumns)
    .from(entries)
    .innerJoin(categories, eq(entries.categoryId, categories.id))
    .innerJoin(accounts, eq(entries.accountId, accounts.id));
}

// Resolve one write-input's category + account NAMEs to their ids (creating rows if new).
function toRow(db: Db, { category, account, ...rest }: EntryInput) {
  return { ...rest, categoryId: categoryIdFor(db, category), accountId: accountIdFor(db, account) };
}

// Bulk: resolve each DISTINCT category/account name once, then map every row through the cached lookup.
function toRows(db: Db, rows: EntryInput[]) {
  const catIds = new Map<string, number>();
  for (const name of new Set(rows.map((r) => r.category)))
    catIds.set(name, categoryIdFor(db, name));
  const acctIds = new Map<string, number>();
  for (const name of new Set(rows.map((r) => r.account))) acctIds.set(name, accountIdFor(db, name));
  return rows.map(({ category, account, ...rest }) => {
    const categoryId = catIds.get(category);
    const accountId = acctIds.get(account);
    if (categoryId === undefined) throw new Error(`toRows: unresolved category "${category}"`);
    if (accountId === undefined) throw new Error(`toRows: unresolved account "${account}"`);
    return { ...rest, categoryId, accountId };
  });
}

export function addEntries(db: Db, rows: EntryInput[]): void {
  if (rows.length === 0) return;
  const resolved = toRows(db, rows);
  db.insert(entries).values(resolved).run();
}

export function getEntries(db: Db): EntryRow[] {
  return entryRowsQuery(db).all();
}

// ponytail: nets in JS over the full table — fine at scaffold scale. Upgrade to SQL aggregates
// (sum/count) if the ledger grows past what's cheap to load.
export function getNetFlow(db: Db): number {
  return getEntries(db).reduce((sum, r) => sum + r.amount, 0);
}

export type Summary = { net: number; inflow: number; outflow: number; count: number };

// Cycle rollup figures. inflow/outflow are split by sign; the home page uses only `count` today
// (to gate the empty state), but the split is kept for a caller that wants where money came from.
function summarize(rows: EntryRow[]): Summary {
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
export function replaceEntries(db: Db, rows: EntryInput[]): void {
  const chunkSize = 500; // 500 rows × bound columns stays well under SQLite's variable cap
  db.transaction((tx) => {
    tx.delete(entries).where(eq(entries.source, 'monefy')).run();
    const resolved = toRows(tx, rows);
    for (let i = 0; i < resolved.length; i += chunkSize) {
      tx.insert(entries)
        .values(resolved.slice(i, i + chunkSize))
        .run();
    }
  });
}

export type Breakdown = { key: string; total: number; count: number };

// moniflow is a spending tracker: cycle reads return expenses only (amount < 0), so the rare income
// row never lands in the summary, donut, records or day totals. Income stays in the DB (lossless
// import) but is out of scope for every UI surface. getCycleSummary derives from this, so it too is
// spending-only.
export function getEntriesInRange(db: Db, start: string, end: string): EntryRow[] {
  return entryRowsQuery(db)
    .where(and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0)))
    .all();
}

export function getCycleSummary(db: Db, start: string, end: string): Summary {
  return summarize(getEntriesInRange(db, start, end));
}

// GROUP BY in SQL so a cycle view never loads the full 10-year ledger. Sorted by magnitude in JS
// (the result set is at most one row per category — tiny).
export function getCategoryBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return db
    .select({
      key: categories.name,
      total: sql<number>`sum(${entries.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(entries)
    .innerJoin(categories, eq(entries.categoryId, categories.id))
    .where(and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0)))
    .groupBy(categories.name)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export function insertEntry(db: Db, entry: EntryInput): void {
  db.insert(entries).values(toRow(db, entry)).run();
}

export function updateEntry(db: Db, id: number, entry: EntryInput): void {
  db.update(entries).set(toRow(db, entry)).where(eq(entries.id, id)).run();
}

export function deleteEntry(db: Db, id: number): void {
  db.delete(entries).where(eq(entries.id, id)).run();
}

export function getEntryById(db: Db, id: number): EntryRow | undefined {
  return entryRowsQuery(db).where(eq(entries.id, id)).get();
}

// Lists all categories, including ones with zero entries — the categories table is now the source
// of truth for "what categories exist" (a category can be created via setCategoryEmoji/categoryIdFor
// before any entry ever uses it).
export function getDistinctCategories(db: Db): string[] {
  return db
    .select({ name: categories.name })
    .from(categories)
    .orderBy(categories.name)
    .all()
    .map((r) => r.name);
}

export function getDistinctAccounts(db: Db): string[] {
  return db
    .select({ name: accounts.name })
    .from(accounts)
    .orderBy(accounts.name)
    .all()
    .map((r) => r.name);
}

// Accounts ordered by how often they've been used (most-used first). Drives the quick-entry account
// grid so the common accounts land at the front.
export function getAccountsByUsage(db: Db): string[] {
  return db
    .select({ account: accounts.name, count: sql<number>`count(${entries.id})` })
    .from(accounts)
    .leftJoin(entries, eq(entries.accountId, accounts.id))
    .groupBy(accounts.id)
    .all()
    .sort((a, b) => b.count - a.count)
    .map((r) => r.account);
}

// Non-null currency codes seen in the ledger, most-used first. Drives the keypad currency picker's
// auto-ordering (THB pinned separately in keypad-lists). Nulls (legacy THB rows) are excluded.
export function getCurrencyCounts(db: Db): { currency: string; count: number }[] {
  return db
    .select({ currency: entries.currency, count: sql<number>`count(${entries.id})` })
    .from(entries)
    .where(sql`${entries.currency} is not null`)
    .groupBy(entries.currency)
    .all()
    .filter((r): r is { currency: string; count: number } => r.currency !== null)
    .sort((a, b) => b.count - a.count);
}

// The account on the most recent entry — the quick-entry form's default, so the next entry starts on
// the account you last used. `undefined` when the ledger is empty (caller falls back).
export function getLatestAccount(db: Db): string | undefined {
  return db
    .select({ account: accounts.name })
    .from(entries)
    .innerJoin(accounts, eq(entries.accountId, accounts.id))
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .limit(1)
    .get()?.account;
}

export type CategoryCount = { category: string; count: number };

// Category cleanup surface: how many rows sit in each category, so the biggest fragments are
// obvious before a rename/merge. leftJoin so a category with zero entries still shows up (at
// count 0) instead of disappearing from the list. Grouped in SQL; sorted by count in JS — the
// result set is at most one row per category, tiny even over a decade of data.
export function getCategoryCounts(db: Db): CategoryCount[] {
  return db
    .select({ category: categories.name, count: sql<number>`count(${entries.id})` })
    .from(categories)
    .leftJoin(entries, eq(entries.categoryId, categories.id))
    .groupBy(categories.id)
    .all()
    .sort((a, b) => b.count - a.count);
}

// Rename a category by id, or MERGE when `to` already names a different category: reassign this
// category's entries to the target, settle the per-category budget (see below), then delete the
// now-empty source row. A pure rename keeps the same id — entries are never rewritten, and the
// emoji/hue on the row follow the rename for free. No-op when `from` doesn't exist.
//
// Budget on merge: if the target already has a per-category budget its cap wins and the source's is
// dropped; if only the source had one, it moves to the target so the user's cap isn't silently lost.
// (Summing the two caps is a smarter policy for another day, only if users ask.)
export function renameCategory(db: Db, from: string, to: string): void {
  const source = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, from))
    .get();
  if (!source) return;
  const target = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, to))
    .get();
  if (target && target.id !== source.id) {
    db.transaction((tx) => {
      tx.update(entries)
        .set({ categoryId: target.id })
        .where(eq(entries.categoryId, source.id))
        .run();
      const targetBudget = tx
        .select({ id: budgets.id })
        .from(budgets)
        .where(eq(budgets.categoryId, target.id))
        .get();
      if (targetBudget) {
        tx.delete(budgets).where(eq(budgets.categoryId, source.id)).run();
      } else {
        tx.update(budgets)
          .set({ categoryId: target.id })
          .where(eq(budgets.categoryId, source.id))
          .run();
      }
      tx.delete(categories).where(eq(categories.id, source.id)).run();
    });
  } else {
    db.update(categories).set({ name: to }).where(eq(categories.id, source.id)).run();
  }
}

// Delete a category — but ONLY when it holds no entries. Moniflow's ledger is lossless, so a used
// category is protected: this is a no-op if any entry still references it. The guard lives here, not
// just in the UI, so a stale page can't orphan ledger rows. An empty category's leftover per-category
// budget is dropped with it. No-op when the name doesn't exist. (Lives here, next to renameCategory,
// because categories/ must not import entries/budgets — the dependency arrow points the other way.)
export function deleteCategory(db: Db, name: string): void {
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .get();
  if (!row) return;
  const used = db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.categoryId, row.id))
    .get();
  if (used) return;
  db.transaction((tx) => {
    tx.delete(budgets).where(eq(budgets.categoryId, row.id)).run();
    tx.delete(categories).where(eq(categories.id, row.id)).run();
  });
}

// Free-text search across the whole ledger (not cycle-scoped) — matches a substring of the note,
// category, or account, case-insensitively, expenses only (same spending-tracker scope as the cycle
// reads). Newest first. LIKE metacharacters in the query are escaped so a literal '_' or '%' can't
// widen the match. A blank query returns nothing rather than the whole ledger.
export function searchEntries(db: Db, query: string): EntryRow[] {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const has = (col: AnyColumn) => sql`${col} like ${pattern} escape '\\'`;
  return entryRowsQuery(db)
    .where(
      and(lt(entries.amount, 0), or(has(entries.note), has(categories.name), has(accounts.name))),
    )
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
}

// All-time expenses for one category, newest first — powers the /categories count link, which wants
// every record in the category, not just the current cycle (unlike the cycle-scoped chip filter).
export function getEntriesByCategory(db: Db, category: string): EntryRow[] {
  return entryRowsQuery(db)
    .where(and(lt(entries.amount, 0), eq(categories.name, category)))
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
}

// Foreign-currency rows for the trip view — anything not THB (and not null, which covers legacy
// or bad-import rows). Ordered by date then id so groupIntoTrips can walk it as one chronological
// pass without needing to trust the caller's ordering.
export function getForeignEntries(db: Db): EntryRow[] {
  return entryRowsQuery(db)
    .where(and(isNotNull(entries.currency), ne(entries.currency, 'THB')))
    .orderBy(entries.date, entries.id)
    .all();
}

// One trip's rows: a single foreign currency within an inclusive date range, newest first. Mirrors
// getForeignEntries' predicate (no amount<0 filter — trips count every foreign row, refunds included,
// same as groupIntoTrips) so the list matches the trip card's count and totals exactly.
export function getTripEntries(db: Db, currency: string, start: string, end: string): EntryRow[] {
  return entryRowsQuery(db)
    .where(and(eq(entries.currency, currency), gte(entries.date, start), lte(entries.date, end)))
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
}

// All trip names as an id → title map, so the Trips page can look each trip up in one read.
export function getTripTitles(db: Db): Map<string, string> {
  return new Map(
    db
      .select()
      .from(tripTitles)
      .all()
      .map((r) => [r.id, r.title]),
  );
}

// Set or clear a trip's name. A blank/whitespace title deletes the row (back to the unnamed default);
// otherwise upsert on the trip id so renaming is idempotent.
export function setTripTitle(db: Db, id: string, title: string): void {
  const trimmed = title.trim();
  if (!trimmed) {
    db.delete(tripTitles).where(eq(tripTitles.id, id)).run();
    return;
  }
  db.insert(tripTitles)
    .values({ id, title: trimmed })
    .onConflictDoUpdate({ target: tripTitles.id, set: { title: trimmed } })
    .run();
}

export type AccountCount = { account: string; count: number };

// How many rows sit in each account, so the biggest are obvious before a rename/merge. leftJoin so an
// account with zero entries still shows (count 0). Grouped in SQL; sorted by count in JS (tiny result).
export function getAccountCounts(db: Db): AccountCount[] {
  return db
    .select({ account: accounts.name, count: sql<number>`count(${entries.id})` })
    .from(accounts)
    .leftJoin(entries, eq(entries.accountId, accounts.id))
    .groupBy(accounts.id)
    .all()
    .sort((a, b) => b.count - a.count);
}

// Per-account spending for a cycle (expenses only, magnitudes sorted desc) — feeds the /accounts donut
// + breakdown. Same shape/scope as getCategoryBreakdown.
export function getAccountBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return db
    .select({
      key: accounts.name,
      total: sql<number>`sum(${entries.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(entries)
    .innerJoin(accounts, eq(entries.accountId, accounts.id))
    .where(and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0)))
    .groupBy(accounts.name)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// Rename an account by id, or MERGE when `to` already names a different account: reassign this
// account's entries to the target, then delete the now-empty source row. A pure rename keeps the same
// id (entries never rewritten; icon/hue follow the rename for free). No-op when `from` doesn't exist.
export function renameAccount(db: Db, from: string, to: string): void {
  const source = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, from)).get();
  if (!source) return;
  const target = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, to)).get();
  if (target && target.id !== source.id) {
    mergeAccountInto(db, from, to); // one implementation of "merge accounts"; snapshot discarded here
  } else {
    db.update(accounts).set({ name: to }).where(eq(accounts.id, source.id)).run();
  }
}

// Delete an account — but ONLY when it holds no entries (the ledger is lossless, so a used account is
// protected; use mergeAccountInto to remove a used one). No-op when the name doesn't exist.
export function deleteAccount(db: Db, name: string): void {
  const row = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, name)).get();
  if (!row) return;
  const used = db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.accountId, row.id))
    .get();
  if (used) return;
  db.delete(accounts).where(eq(accounts.id, row.id)).run();
}

// A snapshot of a merge, enough to reverse it: the removed source account's display meta + exactly
// which entry ids were reassigned. Threaded to the client so the Undo toast can call undoMergeAccount.
export type AccountMergeSnapshot = {
  source: { name: string; icon: string; hue: number | null };
  targetName: string;
  movedIds: number[];
};

// Merge `from` INTO `to`, capturing an undo snapshot. Reassigns the source's entries to the target and
// deletes the source row. No-op-ish snapshot (empty movedIds) if either name is missing or equal.
export function mergeAccountInto(db: Db, from: string, to: string): AccountMergeSnapshot {
  const empty: AccountMergeSnapshot = {
    source: { name: from, icon: FALLBACK_ICON, hue: null },
    targetName: to,
    movedIds: [],
  };
  if (from === to) return empty;
  const source = db
    .select({ id: accounts.id, name: accounts.name, icon: accounts.icon, hue: accounts.hue })
    .from(accounts)
    .where(eq(accounts.name, from))
    .get();
  const target = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, to)).get();
  if (!source || !target) return empty;
  const moved = db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.accountId, source.id))
    .all()
    .map((r) => r.id);
  db.transaction((tx) => {
    tx.update(entries).set({ accountId: target.id }).where(eq(entries.accountId, source.id)).run();
    tx.delete(accounts).where(eq(accounts.id, source.id)).run();
  });
  return {
    source: { name: source.name, icon: source.icon, hue: source.hue },
    targetName: to,
    movedIds: moved,
  };
}

// Reverse a merge: recreate the source account with its old icon/hue, then move exactly the snapshot's
// entries back onto it. Idempotent-ish — if the source name was recreated meanwhile, onConflictDoNothing
// keeps its current row and the ids are still reassigned.
export function undoMergeAccount(db: Db, snap: AccountMergeSnapshot): void {
  if (snap.movedIds.length === 0) return;
  db.transaction((tx) => {
    tx.insert(accounts)
      .values({ name: snap.source.name, icon: snap.source.icon, hue: snap.source.hue })
      .onConflictDoNothing({ target: accounts.name })
      .run();
    const row = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.name, snap.source.name))
      .get();
    if (!row) throw new Error(`undoMergeAccount: could not recreate "${snap.source.name}"`);
    for (const id of snap.movedIds) {
      tx.update(entries).set({ accountId: row.id }).where(eq(entries.id, id)).run();
    }
  });
}
