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
import { recurrences } from '@features/recurring/schema';

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
async function toRow(db: Db, { category, account, ...rest }: EntryInput) {
  return {
    ...rest,
    categoryId: await categoryIdFor(db, category),
    accountId: await accountIdFor(db, account),
  };
}

// Bulk: resolve each DISTINCT category/account name once, then map every row through the cached lookup.
async function toRows(db: Db, rows: EntryInput[]) {
  const catIds = new Map<string, number>();
  for (const name of new Set(rows.map((r) => r.category)))
    catIds.set(name, await categoryIdFor(db, name));
  const acctIds = new Map<string, number>();
  for (const name of new Set(rows.map((r) => r.account)))
    acctIds.set(name, await accountIdFor(db, name));
  return rows.map(({ category, account, ...rest }) => {
    const categoryId = catIds.get(category);
    const accountId = acctIds.get(account);
    if (categoryId === undefined) throw new Error(`toRows: unresolved category "${category}"`);
    if (accountId === undefined) throw new Error(`toRows: unresolved account "${account}"`);
    return { ...rest, categoryId, accountId };
  });
}

export async function addEntries(db: Db, rows: EntryInput[]): Promise<void> {
  if (rows.length === 0) return;
  const resolved = await toRows(db, rows);
  await db.insert(entries).values(resolved).run();
}

export async function getEntries(db: Db): Promise<EntryRow[]> {
  return await entryRowsQuery(db).all();
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

// Replace-all restore from a full backup: clears EVERY entry, then inserts the backup rows. Chunked
// inside one batch — a single insert of a ~10.7k-row export exceeds SQLite's 32,766 bound-variable
// cap, and the delete + inserts must be atomic so a failure can't leave a half ledger. Only entries
// are touched — budgets and category metadata survive, so restoring the ledger never nukes standing
// config.
//
// ponytail: name->id creation runs in toRows (above), outside this batch; the delete+inserts stay
// atomic. First element (delete) makes the array a non-empty tuple for db.batch.
export async function restoreEntries(db: Db, rows: EntryInput[]): Promise<void> {
  const chunkSize = 500; // stays under SQLite's bound-variable cap
  const resolved = await toRows(db, rows);
  const inserts = [];
  for (let i = 0; i < resolved.length; i += chunkSize)
    inserts.push(db.insert(entries).values(resolved.slice(i, i + chunkSize)));
  await db.batch([db.delete(entries), ...inserts]);
}

export type Breakdown = { key: string; total: number; count: number };

// moniflow tracks spending, but the ledger holds refunds too: money handed back against spending
// that already happened (a friend repaying their share while the card carried the whole bill). They
// are ordinary rows with a POSITIVE amount, filed under the category they refund, so every sum here
// nets on its own. Consumers negate rather than Math.abs — see off-budget.ts and donut.ts.
export async function getEntriesInRange(db: Db, start: string, end: string): Promise<EntryRow[]> {
  return await entryRowsQuery(db)
    .where(and(gte(entries.date, start), lte(entries.date, end)))
    .all();
}

export async function getCycleSummary(db: Db, start: string, end: string): Promise<Summary> {
  return summarize(await getEntriesInRange(db, start, end));
}

// Does the ledger hold ANY expense, in any cycle? Home needs this to tell its two empty states
// apart: a genuinely empty ledger earns the first-run onboarding, while an empty CYCLE in a ledger
// with history must not — telling someone with ten years of records "No entries yet" reads as data
// loss. LIMIT 1, so it stays O(1)-ish however big the ledger gets.
export async function hasAnyExpense(db: Db): Promise<boolean> {
  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(lt(entries.amount, 0))
    .limit(1)
    .all();
  return rows.length > 0;
}

// The oldest expense in the ledger, or null when there is none. /year's stepper clamps against it
// so you can't walk back through empty years forever. ORDER BY + LIMIT 1 rather than min(): same
// answer, one indexed row, and no sql`` template to type around. Expenses only, matching every
// other read surface — an ancient income row must not open a year with nothing to show.
export async function getFirstExpenseDate(db: Db): Promise<string | null> {
  const rows = await db
    .select({ date: entries.date })
    .from(entries)
    .where(lt(entries.amount, 0))
    .orderBy(entries.date)
    .limit(1)
    .all();
  return rows[0]?.date ?? null;
}

// GROUP BY in SQL so a cycle view never loads the full 10-year ledger. Sorted by magnitude in JS
// (the result set is at most one row per category — tiny).
export async function getCategoryBreakdown(
  db: Db,
  start: string,
  end: string,
): Promise<Breakdown[]> {
  return (
    await db
      .select({
        key: categories.name,
        total: sql<number>`sum(${entries.amount})`,
        count: sql<number>`count(*)`,
      })
      .from(entries)
      .innerJoin(categories, eq(entries.categoryId, categories.id))
      .where(and(gte(entries.date, start), lte(entries.date, end)))
      .groupBy(categories.name)
      .all()
  ).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export async function insertEntry(db: Db, entry: EntryInput): Promise<void> {
  await db
    .insert(entries)
    .values(await toRow(db, entry))
    .run();
}

export async function updateEntry(db: Db, id: number, entry: EntryInput): Promise<void> {
  await db
    .update(entries)
    .set(await toRow(db, entry))
    .where(eq(entries.id, id))
    .run();
}

export async function deleteEntry(db: Db, id: number): Promise<void> {
  await db.delete(entries).where(eq(entries.id, id)).run();
}

export async function getEntryById(db: Db, id: number): Promise<EntryRow | undefined> {
  return await entryRowsQuery(db).where(eq(entries.id, id)).get();
}

// Lists all categories, including ones with zero entries — the categories table is now the source
// of truth for "what categories exist" (a category can be created via setCategoryEmoji/categoryIdFor
// before any entry ever uses it).
export async function getDistinctCategories(db: Db): Promise<string[]> {
  return (
    await db.select({ name: categories.name }).from(categories).orderBy(categories.name).all()
  ).map((r) => r.name);
}

// Distinct non-blank notes seen in the ledger — the autocomplete pool behind the note field's
// datalist. Unlike categories/accounts there is no notes table: the ledger's own note column is the
// only record of what you've typed before, so this reads straight off entries.
// ponytail: uncapped — every note becomes a DOM <option> in the form. Fine at hundreds; add a
// .limit() if a multi-year ledger ever makes the note field feel heavy on a phone.
export async function getDistinctNotes(db: Db): Promise<string[]> {
  return (
    await db
      .select({ note: entries.note, count: sql<number>`count(*)` })
      .from(entries)
      .where(and(isNotNull(entries.note), ne(entries.note, '')))
      .groupBy(entries.note)
      .orderBy(desc(sql`count(*)`))
      .all()
  ).flatMap((r) => (r.note === null ? [] : [r.note]));
}

export async function getDistinctAccounts(db: Db): Promise<string[]> {
  return (await db.select({ name: accounts.name }).from(accounts).orderBy(accounts.name).all()).map(
    (r) => r.name,
  );
}

// Accounts ordered by how often they've been used (most-used first). Drives the quick-entry account
// grid so the common accounts land at the front.
export async function getAccountsByUsage(db: Db): Promise<string[]> {
  return (
    await db
      .select({ account: accounts.name, count: sql<number>`count(${entries.id})` })
      .from(accounts)
      .leftJoin(entries, eq(entries.accountId, accounts.id))
      .groupBy(accounts.id)
      .all()
  )
    .sort((a, b) => b.count - a.count)
    .map((r) => r.account);
}

// Non-null currency codes seen in the ledger, most-used first. Drives the keypad currency picker's
// auto-ordering (THB pinned separately in keypad-lists). Nulls (legacy THB rows) are excluded.
export async function getCurrencyCounts(db: Db): Promise<{ currency: string; count: number }[]> {
  return (
    await db
      .select({ currency: entries.currency, count: sql<number>`count(${entries.id})` })
      .from(entries)
      .where(sql`${entries.currency} is not null`)
      .groupBy(entries.currency)
      .all()
  )
    .filter((r): r is { currency: string; count: number } => r.currency !== null)
    .sort((a, b) => b.count - a.count);
}

// The account on the most recent entry — the quick-entry form's default, so the next entry starts on
// the account you last used. `undefined` when the ledger is empty (caller falls back).
export async function getLatestAccount(db: Db): Promise<string | undefined> {
  return (
    await db
      .select({ account: accounts.name })
      .from(entries)
      .innerJoin(accounts, eq(entries.accountId, accounts.id))
      .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
      .limit(1)
      .get()
  )?.account;
}

export type CategoryCount = { category: string; count: number };

// Category cleanup surface: how many rows sit in each category, so the biggest fragments are
// obvious before a rename/merge. leftJoin so a category with zero entries still shows up (at
// count 0) instead of disappearing from the list. Grouped in SQL; sorted by count in JS — the
// result set is at most one row per category, tiny even over a decade of data.
export async function getCategoryCounts(db: Db): Promise<CategoryCount[]> {
  return (
    await db
      .select({ category: categories.name, count: sql<number>`count(${entries.id})` })
      .from(categories)
      .leftJoin(entries, eq(entries.categoryId, categories.id))
      .groupBy(categories.id)
      .all()
  ).sort((a, b) => b.count - a.count);
}

// Rename a category by id, or MERGE when `to` already names a different category: reassign this
// category's entries to the target, settle the per-category budget (see below), then delete the
// now-empty source row. A pure rename keeps the same id — entries are never rewritten, and the
// emoji/hue on the row follow the rename for free. No-op when `from` doesn't exist.
//
// Budget on merge: if the target already has a per-category budget its cap wins and the source's is
// dropped; if only the source had one, it moves to the target so the user's cap isn't silently lost.
// (Summing the two caps is a smarter policy for another day, only if users ask.)
export async function renameCategory(db: Db, from: string, to: string): Promise<void> {
  const source = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, from))
    .get();
  if (!source) return;
  const target = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, to))
    .get();
  if (target && target.id !== source.id) {
    const targetBudget = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(eq(budgets.categoryId, target.id))
      .get();
    const budgetStmt = targetBudget
      ? db.delete(budgets).where(eq(budgets.categoryId, source.id))
      : db.update(budgets).set({ categoryId: target.id }).where(eq(budgets.categoryId, source.id));
    await db.batch([
      db.update(entries).set({ categoryId: target.id }).where(eq(entries.categoryId, source.id)),
      budgetStmt,
      db.delete(categories).where(eq(categories.id, source.id)),
    ]);
  } else {
    await db.update(categories).set({ name: to }).where(eq(categories.id, source.id)).run();
  }
}

// Delete a category — but ONLY when it holds no entries. Moniflow's ledger is lossless, so a used
// category is protected: this is a no-op if any entry still references it. The guard lives here, not
// just in the UI, so a stale page can't orphan ledger rows. An empty category's leftover per-category
// budget is dropped with it. No-op when the name doesn't exist. (Lives here, next to renameCategory,
// because categories/ must not import entries/budgets — the dependency arrow points the other way.)
export async function deleteCategory(db: Db, name: string): Promise<void> {
  const row = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .get();
  if (!row) return;
  const used = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.categoryId, row.id))
    .get();
  if (used) return;
  // A rule that has never posted references a category with zero entries — so the entries guard
  // above does not see it. Deleting anyway would leave the rule pointing at a dangling id, and the
  // sweep's rows would then fail entryRowsQuery's innerJoin and vanish from every read surface
  // silently. Refuse instead.
  const ruled = await db
    .select({ id: recurrences.id })
    .from(recurrences)
    .where(eq(recurrences.categoryId, row.id))
    .get();
  if (ruled) return;
  await db.batch([
    db.delete(budgets).where(eq(budgets.categoryId, row.id)),
    db.delete(categories).where(eq(categories.id, row.id)),
  ]);
}

// Free-text search across the whole ledger (not cycle-scoped) — matches a substring of the note,
// category, or account, case-insensitively, refunds included, so a repayment is findable. Newest
// first. LIKE metacharacters in the query are escaped so a literal '_' or '%' can't widen the match.
// A blank query returns nothing rather than the whole ledger.
export async function searchEntries(db: Db, query: string): Promise<EntryRow[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const has = (col: AnyColumn) => sql`${col} like ${pattern} escape '\\'`;
  return await entryRowsQuery(db)
    .where(or(has(entries.note), has(categories.name), has(accounts.name)))
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
}

// All-time entries for one category, refunds included, newest first — powers the /categories count
// link, which wants every record in the category, not just the current cycle (unlike the cycle-scoped
// chip filter).
export async function getEntriesByCategory(db: Db, category: string): Promise<EntryRow[]> {
  return await entryRowsQuery(db)
    .where(eq(categories.name, category))
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
}

// Foreign-currency rows for the trip view — anything not THB (and not null, which covers legacy
// or bad-import rows). Ordered by date then id so groupIntoTrips can walk it as one chronological
// pass without needing to trust the caller's ordering.
export async function getForeignEntries(db: Db): Promise<EntryRow[]> {
  return await entryRowsQuery(db)
    .where(and(isNotNull(entries.currency), ne(entries.currency, 'THB')))
    .orderBy(entries.date, entries.id)
    .all();
}

// One trip's rows: a single foreign currency within an inclusive date range, newest first. Mirrors
// getForeignEntries' predicate (no amount<0 filter — trips count every foreign row, refunds included,
// same as groupIntoTrips) so the list matches the trip card's count and totals exactly.
export async function getTripEntries(
  db: Db,
  currency: string,
  start: string,
  end: string,
): Promise<EntryRow[]> {
  return await entryRowsQuery(db)
    .where(and(eq(entries.currency, currency), gte(entries.date, start), lte(entries.date, end)))
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
}

// All trip names as an id → title map, so the Trips page can look each trip up in one read.
export async function getTripTitles(db: Db): Promise<Map<string, string>> {
  return new Map((await db.select().from(tripTitles).all()).map((r) => [r.id, r.title]));
}

// Set or clear a trip's name. A blank/whitespace title deletes the row (back to the unnamed default);
// otherwise upsert on the trip id so renaming is idempotent.
export async function setTripTitle(db: Db, id: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) {
    await db.delete(tripTitles).where(eq(tripTitles.id, id)).run();
    return;
  }
  await db
    .insert(tripTitles)
    .values({ id, title: trimmed })
    .onConflictDoUpdate({ target: tripTitles.id, set: { title: trimmed } })
    .run();
}

export type AccountCount = { account: string; count: number };

// How many rows sit in each account, so the biggest are obvious before a rename/merge. leftJoin so an
// account with zero entries still shows (count 0). Grouped in SQL; sorted by count in JS (tiny result).
export async function getAccountCounts(db: Db): Promise<AccountCount[]> {
  return (
    await db
      .select({ account: accounts.name, count: sql<number>`count(${entries.id})` })
      .from(accounts)
      .leftJoin(entries, eq(entries.accountId, accounts.id))
      .groupBy(accounts.id)
      .all()
  ).sort((a, b) => b.count - a.count);
}

// Per-account spending for a cycle (expenses only, magnitudes sorted desc) — feeds the /accounts donut
// + breakdown. Same shape/scope as getCategoryBreakdown.
export async function getAccountBreakdown(
  db: Db,
  start: string,
  end: string,
): Promise<Breakdown[]> {
  return (
    await db
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
  ).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// Rename an account by id, or MERGE when `to` already names a different account: reassign this
// account's entries to the target, then delete the now-empty source row. A pure rename keeps the same
// id (entries never rewritten; icon/hue follow the rename for free). No-op when `from` doesn't exist.
export async function renameAccount(db: Db, from: string, to: string): Promise<void> {
  const source = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, from))
    .get();
  if (!source) return;
  const target = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, to))
    .get();
  if (target && target.id !== source.id) {
    await mergeAccountInto(db, from, to); // one implementation of "merge accounts"; snapshot discarded here
  } else {
    await db.update(accounts).set({ name: to }).where(eq(accounts.id, source.id)).run();
  }
}

// Delete an account — but ONLY when it holds no entries (the ledger is lossless, so a used account is
// protected; use mergeAccountInto to remove a used one). No-op when the name doesn't exist.
export async function deleteAccount(db: Db, name: string): Promise<void> {
  const row = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, name))
    .get();
  if (!row) return;
  const used = await db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.accountId, row.id))
    .get();
  if (used) return;
  // Same reasoning as deleteCategory: a never-posted rule holds an account id the entries guard
  // cannot see, and a dangling account_id makes the sweep's rows vanish from every read surface.
  const ruled = await db
    .select({ id: recurrences.id })
    .from(recurrences)
    .where(eq(recurrences.accountId, row.id))
    .get();
  if (ruled) return;
  await db.delete(accounts).where(eq(accounts.id, row.id)).run();
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
export async function mergeAccountInto(
  db: Db,
  from: string,
  to: string,
): Promise<AccountMergeSnapshot> {
  const empty: AccountMergeSnapshot = {
    source: { name: from, icon: FALLBACK_ICON, hue: null },
    targetName: to,
    movedIds: [],
  };
  if (from === to) return empty;
  const source = await db
    .select({ id: accounts.id, name: accounts.name, icon: accounts.icon, hue: accounts.hue })
    .from(accounts)
    .where(eq(accounts.name, from))
    .get();
  const target = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, to))
    .get();
  if (!source || !target) return empty;
  const moved = (
    await db.select({ id: entries.id }).from(entries).where(eq(entries.accountId, source.id)).all()
  ).map((r) => r.id);
  await db.batch([
    db.update(entries).set({ accountId: target.id }).where(eq(entries.accountId, source.id)),
    db.delete(accounts).where(eq(accounts.id, source.id)),
  ]);
  return {
    source: { name: source.name, icon: source.icon, hue: source.hue },
    targetName: to,
    movedIds: moved,
  };
}

// Reverse a merge: recreate the source account with its old icon/hue, then move exactly the snapshot's
// entries back onto it. Idempotent-ish — if the source name was recreated meanwhile, onConflictDoNothing
// keeps its current row and the ids are still reassigned.
export async function undoMergeAccount(db: Db, snap: AccountMergeSnapshot): Promise<void> {
  if (snap.movedIds.length === 0) return;
  await db
    .insert(accounts)
    .values({ name: snap.source.name, icon: snap.source.icon, hue: snap.source.hue })
    .onConflictDoNothing({ target: accounts.name })
    .run();
  const row = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, snap.source.name))
    .get();
  if (!row) throw new Error(`undoMergeAccount: could not recreate "${snap.source.name}"`);
  // non-empty tuple for db.batch without an `as` cast (movedIds is guaranteed non-empty here)
  const mk = (id: number) =>
    db.update(entries).set({ accountId: row.id }).where(eq(entries.id, id));
  const [firstId, ...restIds] = snap.movedIds;
  await db.batch([mk(firstId), ...restIds.map(mk)]);
}
