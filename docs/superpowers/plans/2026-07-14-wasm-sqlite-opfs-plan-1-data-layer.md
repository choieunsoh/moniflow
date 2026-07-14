# WASM-SQLite/OPFS Migration — Plan 1: Async Data Layer + Browser Runtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert moniflow's data layer from synchronous server-side `better-sqlite3` to an async `sqlite-proxy` driver that runs WASM SQLite in a Web Worker persisted to OPFS — with every query test green — without yet touching the UI, and delete the now-dead legacy migration subsystem.

**Architecture:** One drizzle driver (`sqlite-proxy`, async) with two backends: a WASM-SQLite-on-OPFS Web Worker in the browser, and an in-memory `better-sqlite3` shim in Node (tests + CLI). All `queries.ts` functions become `async`; every `db.transaction` site is reclassified as a flat `db.batch`, a resolve-then-batch, or an interactive read→decide→batch. Pages/components/actions are NOT changed here — the web UI is expected to be temporarily broken at the end of Plan 1 and is repaired in Plan 2. Tests and the CLI stay green throughout (except deletions).

**Tech Stack:** `@sqlite.org/sqlite-wasm` (OPFS SAHPool VFS), `drizzle-orm/sqlite-proxy`, `better-sqlite3` (retained for the Node shim + CLI), Vitest, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-11-wasm-sqlite-opfs-pwa-design.md` (refreshed 2026-07-14).

**Scope boundary (Plan 2, written later):** client-component page conversion, replacing Server Actions with client writes + local refresh, the browser Import/Export UI, the PWA manifest/service worker, `next.config` static export, `force-dynamic` removal, and deleting `src/middleware.ts`. None of that is in Plan 1.

## Global Constraints

- **TypeScript strict:** no `any`, no `as` casts, no `!` assertion, no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`. `as const` and `satisfies` are allowed. `type` over `interface`. `for..of` over `.forEach`.
- **No new dependencies** beyond `@sqlite.org/sqlite-wasm` (Task 1). `better-sqlite3` stays (Node shim + CLI).
- **`db/` stays feature-free** — `db/worker.ts`, `db/node-proxy.ts`, `db/client.ts` must not import any `@features/*` module (the dependency arrow points features → db only). The worker's table DDL is duplicated as raw SQL to honour this (documented `ponytail:` in Task 10).
- **Shell:** run all commands in **Git Bash (POSIX)**, not PowerShell.
- **The `Db` type is the single seam:** `Db = SqliteRemoteDatabase<Record<string, never>>` (Task 4). Every `queries.ts`/`schema.ts` signature depends only on it.
- **Row shaping contract** (identical in the Node shim and the browser worker): `method: 'run'` → `{ rows: [] }`; `'get'` → `{ rows: <first row as an array of column values> }` (or `[]`); `'all'`/`'values'` → `{ rows: <array of rows-as-arrays> }`.
- **Commit format:** `type(scope): subject` with a body; scopes here are `db`, `features`, `cli`. One topic per commit.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/db/migrate.ts`, `src/db/migrate.test.ts` | Legacy text→id migration | **Delete** (Task 2) |
| `src/features/*/schema.ts` (5) | Tables + `ensure*Table` bootstrap | **Modify** — drop `migrate*` calls (Task 2), then make `ensure*Table` async (Tasks 5–9) |
| `src/db/node-proxy.ts` | Node `better-sqlite3`-backed proxy exec/batch | **Create** (Task 3) |
| `src/db/client.ts` | Public `Db` type + Node backend re-export | **Rewrite** (Task 4) — drops `initDb` |
| `src/features/{entries,budgets,categories,accounts,settings}/queries.ts` | Typed reads/writes | **Modify** — all fns async; transactions → batch (Tasks 5–9) |
| DB-backed test files (11) | query/schema/data tests | **Modify** — `makeNodeProxyDb()` + `await` (Tasks 5–9) |
| `src/db/worker.ts` | Browser DB Worker: WASM SQLite on OPFS | **Create** (Task 10) |
| `src/db/rpc.ts`, `src/db/browser.ts` | Main-thread RPC + `getBrowserDb()` | **Create** (Task 11) |
| `src/cli.ts`, `src/features/entries/seed.ts` | commander CLI + demo seed | **Modify** — async on the Node shim (Task 13) |
| `package.json` | deps | **Modify** (Task 1) |

**Transaction inventory (13 sites), classified:**

| Function | File | Class |
|---|---|---|
| `setCutoff`, `setIconSet`, `setCardFeePct`, `setFxRates` | settings/queries.ts | flat `batch([delete, insert])` |
| `setBudget` | budgets/queries.ts | resolve id → `batch([delete, insert])` |
| `setCategoryOrder`, `setAccountOrder` | categories/, accounts/queries.ts | dynamic `batch` of updates (non-empty-tuple pattern) |
| `replaceEntries`, `restoreEntries` | entries/queries.ts | resolve names (await) → `batch([delete, ...inserts])` |
| `renameCategory`, `deleteCategory`, `mergeAccountInto`, `undoMergeAccount` | entries/queries.ts | interactive: await reads → decide in JS → `batch(writes)` |

---

## Task 1: Add the WASM SQLite dependency

**Files:** Modify `package.json`

- [ ] **Step 1: Install**

Run (Git Bash): `npm install @sqlite.org/sqlite-wasm`

- [ ] **Step 2: Verify it resolved**

Run: `node -e "console.log(require('@sqlite.org/sqlite-wasm/package.json').version)"`
Expected: prints a version, no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(db): add @sqlite.org/sqlite-wasm for browser SQLite"
```

---

## Task 2: Delete the legacy migration subsystem; make `ensure*Table` self-contained (still sync)

Removes `migrate.ts`/`migrate.test.ts` and rewrites the four schemas that import them to `CREATE` the final surrogate-id shape directly. `ensureEntriesTable` gains explicit `ensureCategoriesTable` + `ensureAccountsTable` calls so calling it alone still bootstraps a working ledger (the invariant `entries.test.ts` and `settings/data.test.ts` rely on). **Stays synchronous** — this is a pure refactor that keeps the whole suite green before any async work.

**Files:**
- Delete: `src/db/migrate.ts`, `src/db/migrate.test.ts`
- Modify: `src/features/entries/schema.ts`, `src/features/categories/schema.ts`, `src/features/accounts/schema.ts`, `src/features/budgets/schema.ts`

**Interfaces produced:** `ensureEntriesTable`, `ensureCategoriesTable`, `ensureAccountsTable`, `ensureBudgetsTable`, `ensureSettingsTable`, `ensureTripTitlesTable` — all still `(db: Db): void` after this task.

- [ ] **Step 1: Delete the migration files**

```bash
git rm src/db/migrate.ts src/db/migrate.test.ts
```

- [ ] **Step 2: Rewrite `categories/schema.ts` `ensureCategoriesTable`**

Replace the `migrate`-importing version with a self-contained `CREATE` (drop the `@db/migrate` import):

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  emoji: text('emoji').notNull(),
  hue: integer('hue'),
  sortOrder: integer('sort_order'),
  archived: integer('archived').notNull().default(0),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export function ensureCategoriesTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT NOT NULL,
      hue INTEGER,
      sort_order INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
}
```

- [ ] **Step 3: Rewrite `accounts/schema.ts` `ensureAccountsTable`**

Drop the `@db/migrate` import; give it a real `CREATE` (it currently has none):

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  icon: text('icon').notNull(),
  hue: integer('hue'),
  sortOrder: integer('sort_order'),
  archived: integer('archived').notNull().default(0),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export function ensureAccountsTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      hue INTEGER,
      sort_order INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
}
```

- [ ] **Step 4: Rewrite `budgets/schema.ts` `ensureBudgetsTable`**

Drop the `@db/migrate` import and the two `migrate*`/`dropLegacy*` calls; keep the `CREATE`:

```ts
export function ensureBudgetsTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      amount REAL NOT NULL
    )
  `);
}
```

- [ ] **Step 5: Rewrite `entries/schema.ts` `ensureEntriesTable`**

Drop the `@db/migrate` import and all four `migrate*`/`dropLegacy*` calls. Import the two sibling ensures and call them so the ledger's FK tables exist:

```ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import type { Db } from '@db/client';

// ... entries table + types unchanged ...

// ponytail: ensures the ledger's FK tables (categories, accounts) alongside entries, so calling
// ensureEntriesTable alone yields a queryable ledger — the invariant migrate.ts used to provide.
export function ensureEntriesTable(db: Db): void {
  ensureCategoriesTable(db);
  ensureAccountsTable(db);
  db.run(sql`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT,
      account_id INTEGER,
      category_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT,
      original_amount REAL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual'
    )
  `);
}
```

Leave `ensureTripTitlesTable` and the `entries`/`tripTitles` table definitions unchanged.

- [ ] **Step 6: Run the full suite to verify still green**

Run: `npm test`
Expected: PASS. `migrate.test.ts` is gone; every other DB test still constructs its tables (now via direct `CREATE`s). If any test fails for a missing table, it called `ensure*Table` expecting `migrate` to create a sibling — add the missing `ensure*Table(db)` to that test's setup.

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck` (expected: clean — no async yet).

```bash
git add -A src/db src/features/*/schema.ts
git commit -m "refactor(db): delete legacy migration subsystem; ensure*Table creates final shape" \
  -m "OPFS starts empty at the final surrogate-id schema, so migrate.ts (text->id backfill) has no caller after the browser cutover. ensureEntriesTable now creates categories+accounts directly, preserving the single-call ledger bootstrap. Data carry-over is CSV export->import, not schema migration."
```

---

## Task 3: Node proxy backend (`makeNodeProxyDb`)

The shim that runs the async `sqlite-proxy` driver on in-memory `better-sqlite3` in Node. Every DB test and the CLI use it. Implements the exact row shaping (Global Constraints) — the browser worker (Task 10) mirrors it.

**Files:** Create `src/db/node-proxy.ts`, `src/db/node-proxy.test.ts`

**Interfaces produced:** `makeNodeProxyDb(): SqliteRemoteDatabase<Record<string, never>>`

- [ ] **Step 1: Write the failing test**

`src/db/node-proxy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeNodeProxyDb } from './node-proxy';

describe('makeNodeProxyDb', () => {
  it('runs exec for all/get and returns rows', async () => {
    const db = makeNodeProxyDb();
    await db.run(sql`create table t (id integer primary key, name text)`);
    await db.run(sql`insert into t (name) values ('a'), ('b')`);

    const all = await db.all<{ id: number; name: string }>(sql`select * from t order by id`);
    expect(all).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);

    const one = await db.get<{ name: string }>(sql`select name from t where id = 2`);
    expect(one).toEqual({ name: 'b' });
  });

  it('runs batch as one transaction', async () => {
    const db = makeNodeProxyDb();
    await db.run(sql`create table t (id integer primary key, name text)`);
    await db.batch([
      db.run(sql`insert into t (name) values ('x')`),
      db.run(sql`insert into t (name) values ('y')`),
    ]);
    const all = await db.all<{ name: string }>(sql`select name from t order by id`);
    expect(all.map((r) => r.name)).toEqual(['x', 'y']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/node-proxy.test.ts`
Expected: FAIL — `makeNodeProxyDb` not found.

- [ ] **Step 3: Implement**

`src/db/node-proxy.ts`:
```ts
import Database from 'better-sqlite3';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

// Node-side backend for the async sqlite-proxy driver: an in-memory better-sqlite3 database.
// Used by Vitest and the CLI so tests exercise the SAME async driver + row shaping the browser
// worker (src/db/worker.ts) runs. Keep the row shaping identical across both backends.
export function makeNodeProxyDb(): SqliteRemoteDatabase<Record<string, never>> {
  const raw = new Database(':memory:');
  raw.pragma('journal_mode = WAL');

  const one = (query: string, params: unknown[], method: string): { rows: unknown } => {
    const stmt = raw.prepare(query);
    if (method === 'run') {
      stmt.run(...params);
      return { rows: [] };
    }
    // raw() → arrays of column values, which is what sqlite-proxy expects. 'get' returns a
    // single row array; 'all'/'values' an array of rows.
    const rowsAsArrays = stmt.raw().all(...params);
    if (method === 'get') return { rows: rowsAsArrays[0] ?? [] };
    return { rows: rowsAsArrays };
  };

  return drizzle(
    async (query, params, method) => one(query, params, method),
    async (queries) => {
      const run = raw.transaction(
        (qs: { sql: string; params: unknown[]; method: string }[]) =>
          qs.map((q) => one(q.sql, q.params, q.method)),
      );
      return run(queries);
    },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/db/node-proxy.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/db/node-proxy.ts src/db/node-proxy.test.ts
git commit -m "feat(db): node better-sqlite3 backend for the async sqlite-proxy driver"
```

---

## Task 4: Rewrite `db/client.ts` public surface

`Db` becomes the proxy database type; `initDb` is deleted (`better-sqlite3` is no longer opened directly). Every `queries.ts`/`schema.ts` signature retypes off this one line.

**Files:** Modify `src/db/client.ts`

**Interfaces produced:** `type Db = SqliteRemoteDatabase<Record<string, never>>`; re-export `makeNodeProxyDb`.

- [ ] **Step 1: Replace the file contents**

`src/db/client.ts`:
```ts
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

// The single public database type. Both backends (browser worker, node shim) are sqlite-proxy
// drivers, so features depend only on this — never on a concrete engine. The browser entry point is
// src/db/browser.ts (getBrowserDb()); tests + CLI use makeNodeProxyDb() re-exported here.
export type Db = SqliteRemoteDatabase<Record<string, never>>;

export { makeNodeProxyDb } from './node-proxy';
```

- [ ] **Step 2: Typecheck (expected downstream breakage)**

Run: `npm run typecheck`
Expected: FAIL — many errors in `features/*/queries.ts`/`schema.ts` (their `.all()/.get()/.run()` now return promises; `initDb` gone in tests/CLI). Expected; Tasks 5–9 and 13 fix them. Note the error count to confirm it shrinks per task.

- [ ] **Step 3: Commit**

```bash
git add src/db/client.ts
git commit -m "refactor(db): Db type is now the async sqlite-proxy database; drop initDb"
```

---

## Task 5: Convert `entries` to async (queries + schema + tests)

The largest module: 4 transaction sites (`replaceEntries`, `restoreEntries` = resolve-then-batch; `renameCategory`, `deleteCategory`, `mergeAccountInto`, `undoMergeAccount` = interactive). Read functions gain `async`/`await` mechanically. `ponytail:` name→id resolution now runs before the entry-write batch, so a mid-restore failure can leave orphan categories/accounts (harmless, count 0).

**Files:**
- Modify: `src/features/entries/queries.ts`, `src/features/entries/schema.ts`
- Modify tests: `src/features/entries/queries.test.ts`, `src/features/entries/entries.test.ts`

**Interfaces consumed:** `categoryIdFor`/`accountIdFor` are still sync here — they're converted in Tasks 7/8. **This task will make entries' tests red until 7/8 land** if resolution is awaited against a sync fn. To avoid cross-task breakage, convert the two resolvers FIRST as a prerequisite sub-step below, then entries.

- [ ] **Step 1: Pre-convert the two resolvers to async** (so entries can await them)

In `src/features/categories/queries.ts`, make `categoryIdFor` async:
```ts
export async function categoryIdFor(db: Db, name: string): Promise<number> {
  await db
    .insert(categories)
    .values({ name, emoji: FALLBACK_EMOJI })
    .onConflictDoNothing({ target: categories.name })
    .run();
  const row = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .get();
  if (!row) throw new Error(`categoryIdFor: could not resolve category "${name}"`);
  return row.id;
}
```
In `src/features/accounts/queries.ts`, make `accountIdFor` async (identical shape, `accounts`/`FALLBACK_ICON`):
```ts
export async function accountIdFor(db: Db, name: string): Promise<number> {
  await db
    .insert(accounts)
    .values({ name, icon: FALLBACK_ICON })
    .onConflictDoNothing({ target: accounts.name })
    .run();
  const row = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, name))
    .get();
  if (!row) throw new Error(`accountIdFor: could not resolve account "${name}"`);
  return row.id;
}
```
(The rest of categories/accounts queries are converted in Tasks 7/8; only these two move early.)

- [ ] **Step 2: Update entries test files first**

In `queries.test.ts` and `entries.test.ts`:
- `import { initDb } from '@db/client'` → `import { makeNodeProxyDb } from '@db/client'`.
- Every `initDb(':memory:')` → `makeNodeProxyDb()`.
- `await` every `ensure*Table(db)` call and every `queries.ts` call; make each `it(...)` callback `async`.

- [ ] **Step 3: Make `ensureEntriesTable` (+ siblings it calls) async**

In `entries/schema.ts`: `export async function ensureEntriesTable(db: Db): Promise<void>`, and `await ensureCategoriesTable(db); await ensureAccountsTable(db); await db.run(sql\`CREATE TABLE ...entries...\`);`. Also make `ensureTripTitlesTable` async (`await db.run(...)`). (Tasks 7/8/6/9 make the sibling `ensure*Table` async; do those signatures here if not yet done — they must all be `Promise<void>`.)

- [ ] **Step 4: Run entries tests to verify they fail**

Run: `npm test -- src/features/entries/queries.test.ts src/features/entries/entries.test.ts`
Expected: FAIL — entries query fns still sync / type mismatch.

- [ ] **Step 5: Convert `entries/queries.ts`**

Make `toRow`/`toRows` async; `await` the resolvers:
```ts
async function toRow(db: Db, { category, account, ...rest }: EntryInput) {
  return {
    ...rest,
    categoryId: await categoryIdFor(db, category),
    accountId: await accountIdFor(db, account),
  };
}

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
```

Read functions — add `async`, `await` the chain, wrap the return type in `Promise<...>`. Exact new signatures (bodies gain only `async`/`await`; the `.sort(...)`/`.map(...)`/`summarize(...)` post-processing stays, applied to the awaited result):
```ts
export async function addEntries(db: Db, rows: EntryInput[]): Promise<void>       // await toRows, then await db.insert(...).values(resolved).run()
export async function getEntries(db: Db): Promise<EntryRow[]>                       // return await entryRowsQuery(db).all()
export async function getNetFlow(db: Db): Promise<number>                          // (await getEntries(db)).reduce(...)
export async function getEntriesInRange(db: Db, start: string, end: string): Promise<EntryRow[]>
export async function getCycleSummary(db: Db, start: string, end: string): Promise<Summary>   // summarize(await getEntriesInRange(...))
export async function getCategoryBreakdown(db: Db, start: string, end: string): Promise<Breakdown[]>  // (await ...all()).sort(...)
export async function insertEntry(db: Db, entry: EntryInput): Promise<void>        // await db.insert(entries).values(await toRow(db, entry)).run()
export async function updateEntry(db: Db, id: number, entry: EntryInput): Promise<void>
export async function deleteEntry(db: Db, id: number): Promise<void>
export async function getEntryById(db: Db, id: number): Promise<EntryRow | undefined>
export async function getDistinctCategories(db: Db): Promise<string[]>
export async function getDistinctAccounts(db: Db): Promise<string[]>
export async function getAccountsByUsage(db: Db): Promise<string[]>
export async function getCurrencyCounts(db: Db): Promise<{ currency: string; count: number }[]>
export async function getLatestAccount(db: Db): Promise<string | undefined>
export async function getCategoryCounts(db: Db): Promise<CategoryCount[]>
export async function searchEntries(db: Db, query: string): Promise<EntryRow[]>
export async function getEntriesByCategory(db: Db, category: string): Promise<EntryRow[]>
export async function getForeignEntries(db: Db): Promise<EntryRow[]>
export async function getTripEntries(db: Db, currency: string, start: string, end: string): Promise<EntryRow[]>
export async function getTripTitles(db: Db): Promise<Map<string, string>>          // build the Map from the awaited rows
export async function setTripTitle(db: Db, id: string, title: string): Promise<void>   // await the delete OR the upsert .run()
export async function getAccountCounts(db: Db): Promise<AccountCount[]>
export async function getAccountBreakdown(db: Db, start: string, end: string): Promise<Breakdown[]>
export async function renameAccount(db: Db, from: string, to: string): Promise<void>
export async function deleteAccount(db: Db, name: string): Promise<void>
```

The transaction/interactive rewrites (verbatim):
```ts
export async function replaceEntries(db: Db, rows: EntryInput[]): Promise<void> {
  const chunkSize = 500; // stays under SQLite's bound-variable cap
  const resolved = await toRows(db, rows);
  const inserts = [];
  for (let i = 0; i < resolved.length; i += chunkSize)
    inserts.push(db.insert(entries).values(resolved.slice(i, i + chunkSize)));
  // ponytail: name->id creation ran in toRows (above), outside this batch; the delete+inserts stay
  // atomic. First element (delete) makes the array a non-empty tuple for db.batch.
  await db.batch([db.delete(entries).where(eq(entries.source, 'monefy')), ...inserts]);
}

export async function restoreEntries(db: Db, rows: EntryInput[]): Promise<void> {
  const chunkSize = 500;
  const resolved = await toRows(db, rows);
  const inserts = [];
  for (let i = 0; i < resolved.length; i += chunkSize)
    inserts.push(db.insert(entries).values(resolved.slice(i, i + chunkSize)));
  await db.batch([db.delete(entries), ...inserts]);
}

export async function renameCategory(db: Db, from: string, to: string): Promise<void> {
  const source = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, from)).get();
  if (!source) return;
  const target = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, to)).get();
  if (target && target.id !== source.id) {
    const targetBudget = await db.select({ id: budgets.id }).from(budgets).where(eq(budgets.categoryId, target.id)).get();
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

export async function deleteCategory(db: Db, name: string): Promise<void> {
  const row = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, name)).get();
  if (!row) return;
  const used = await db.select({ id: entries.id }).from(entries).where(eq(entries.categoryId, row.id)).get();
  if (used) return;
  await db.batch([
    db.delete(budgets).where(eq(budgets.categoryId, row.id)),
    db.delete(categories).where(eq(categories.id, row.id)),
  ]);
}

export async function mergeAccountInto(db: Db, from: string, to: string): Promise<AccountMergeSnapshot> {
  const empty: AccountMergeSnapshot = {
    source: { name: from, icon: FALLBACK_ICON, hue: null },
    targetName: to,
    movedIds: [],
  };
  if (from === to) return empty;
  const source = await db
    .select({ id: accounts.id, name: accounts.name, icon: accounts.icon, hue: accounts.hue })
    .from(accounts).where(eq(accounts.name, from)).get();
  const target = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, to)).get();
  if (!source || !target) return empty;
  const moved = (
    await db.select({ id: entries.id }).from(entries).where(eq(entries.accountId, source.id)).all()
  ).map((r) => r.id);
  await db.batch([
    db.update(entries).set({ accountId: target.id }).where(eq(entries.accountId, source.id)),
    db.delete(accounts).where(eq(accounts.id, source.id)),
  ]);
  return { source: { name: source.name, icon: source.icon, hue: source.hue }, targetName: to, movedIds: moved };
}

export async function undoMergeAccount(db: Db, snap: AccountMergeSnapshot): Promise<void> {
  if (snap.movedIds.length === 0) return;
  await db
    .insert(accounts)
    .values({ name: snap.source.name, icon: snap.source.icon, hue: snap.source.hue })
    .onConflictDoNothing({ target: accounts.name })
    .run();
  const row = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, snap.source.name)).get();
  if (!row) throw new Error(`undoMergeAccount: could not recreate "${snap.source.name}"`);
  // non-empty tuple for db.batch without an `as` cast (movedIds is guaranteed non-empty here)
  const mk = (id: number) => db.update(entries).set({ accountId: row.id }).where(eq(entries.id, id));
  const [firstId, ...restIds] = snap.movedIds;
  await db.batch([mk(firstId), ...restIds.map(mk)]);
}
```
Keep `summarize` (pure) and `entryRowColumns`/`entryRowsQuery`/`renameAccount` structure; `renameAccount` calls `await mergeAccountInto(...)` in its merge branch and awaits its else `.run()`.

- [ ] **Step 6: Run entries tests to verify they pass**

Run: `npm test -- src/features/entries/queries.test.ts src/features/entries/entries.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/entries/ src/features/categories/queries.ts src/features/accounts/queries.ts
git commit -m "refactor(entries): async queries; transactions -> db.batch / read-decide-batch" \
  -m "Reclassify all entries transaction sites for the sqlite-proxy async driver (no interactive db.transaction): replace/restore resolve names then batch; rename/delete/merge/undo read-decide-then-batch. categoryIdFor/accountIdFor pre-converted to async so entries can await them."
```

---

## Task 6: Convert `budgets` to async

**Files:** Modify `src/features/budgets/queries.ts`; tests `src/features/budgets/queries.test.ts`, `src/features/budgets/schema.test.ts`.

- [ ] **Step 1: Update tests** — `initDb(':memory:')` → `makeNodeProxyDb()`; `await` every `ensureBudgetsTable`/`ensureCategoriesTable`/query call; `async` callbacks.

- [ ] **Step 2: Make `ensureBudgetsTable` async** (schema.ts) — `Promise<void>`, `await db.run(...)`.

- [ ] **Step 3: Run to verify fail** — `npm test -- src/features/budgets/` → FAIL.

- [ ] **Step 4: Convert** (`getBudgets` awaits the chain):
```ts
export async function getBudgets(db: Db): Promise<BudgetReadRow[]> {
  return await db
    .select({ id: budgets.id, categoryId: budgets.categoryId, category: categories.name, amount: budgets.amount })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .all();
}

export async function setBudget(db: Db, category: string | null, amount: number): Promise<void> {
  const categoryId = category === null ? null : await categoryIdFor(db, category);
  const del =
    categoryId === null
      ? db.delete(budgets).where(isNull(budgets.categoryId))
      : db.delete(budgets).where(eq(budgets.categoryId, categoryId));
  await db.batch([del, db.insert(budgets).values({ categoryId, amount })]);
}

export async function deleteBudget(db: Db, category: string | null): Promise<void> {
  if (category === null) {
    await db.delete(budgets).where(isNull(budgets.categoryId)).run();
    return;
  }
  const row = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, category)).get();
  if (!row) return;
  await db.delete(budgets).where(eq(budgets.categoryId, row.id)).run();
}
```

- [ ] **Step 5: Run to verify pass** — `npm test -- src/features/budgets/` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/features/budgets/
git commit -m "refactor(budgets): async queries; setBudget resolves id then db.batch"
```

---

## Task 7: Convert `categories` to async

`categoryIdFor` was pre-converted in Task 5 — convert the rest. `setCategoryOrder` (interactive loop) → dynamic non-empty-tuple `db.batch`.

**Files:** Modify `src/features/categories/queries.ts`, `src/features/categories/schema.ts`; tests `queries.test.ts`, `schema.test.ts`.

- [ ] **Step 1: Update tests** — `makeNodeProxyDb()`; `await` all calls incl. `ensureCategoriesTable`; `async` callbacks.

- [ ] **Step 2: `ensureCategoriesTable` async** — `Promise<void>`, `await db.run(...)`.

- [ ] **Step 3: Run to verify fail** — `npm test -- src/features/categories/` → FAIL.

- [ ] **Step 4: Convert** — the map-builders `await` their `.all()` then build the map synchronously; the upserts `await ...run()`:
```ts
export async function getEmojiMap(db: Db): Promise<Record<string, string>>      // const rows = await db.select({name,emoji}).from(categories).all(); build map
export async function setCategoryEmoji(db: Db, category: string, emoji: string): Promise<void>   // await insert.onConflictDoUpdate.run()
export async function addCategory(db: Db, name: string): Promise<void>          // await insert.onConflictDoNothing.run()
export async function getHueMap(db: Db): Promise<Record<string, number>>
export async function setCategoryHue(db: Db, category: string, hue: number | null): Promise<void>
export async function getCategoryOrderMap(db: Db): Promise<Record<string, number>>
```
`setCategoryOrder`:
```ts
export async function setCategoryOrder(db: Db, orderedNames: string[]): Promise<void> {
  if (orderedNames.length === 0) return;
  const mk = (name: string, i: number) =>
    db.update(categories).set({ sortOrder: i }).where(eq(categories.name, name));
  const [first, ...rest] = orderedNames;
  await db.batch([mk(first, 0), ...rest.map((name, i) => mk(name, i + 1))]);
}
```
Keep `emojiFor`/`hueFor` and the `FALLBACK_EMOJI`/`EMOJI_CHOICES`/`EMOJI_LABELS` constants pure/unchanged. `categoryIdFor` is already async from Task 5.

- [ ] **Step 5: Run to verify pass** — `npm test -- src/features/categories/` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/features/categories/
git commit -m "refactor(categories): async queries; setCategoryOrder uses db.batch"
```

---

## Task 8: Convert `accounts` to async

Mirror of Task 7. `accountIdFor` pre-converted in Task 5.

**Files:** Modify `src/features/accounts/queries.ts`, `src/features/accounts/schema.ts`; tests `queries.test.ts`, `schema.test.ts`.

- [ ] **Step 1: Update tests** — `makeNodeProxyDb()`; `await` all incl. `ensureAccountsTable`; `async` callbacks.

- [ ] **Step 2: `ensureAccountsTable` async** — `Promise<void>`, `await db.run(...)`.

- [ ] **Step 3: Run to verify fail** — `npm test -- src/features/accounts/` → FAIL.

- [ ] **Step 4: Convert** signatures (map-builders await `.all()`; upserts await `.run()`):
```ts
export async function getAccountIconMap(db: Db): Promise<Record<string, string>>
export async function setAccountIcon(db: Db, name: string, icon: string): Promise<void>
export async function getAccountHueMap(db: Db): Promise<Record<string, number>>
export async function setAccountHue(db: Db, name: string, hue: number | null): Promise<void>
export async function getAccountOrderMap(db: Db): Promise<Record<string, number>>
export async function addAccount(db: Db, name: string): Promise<void>
export async function listAccounts(db: Db): Promise<string[]>
```
`setAccountOrder`:
```ts
export async function setAccountOrder(db: Db, orderedNames: string[]): Promise<void> {
  if (orderedNames.length === 0) return;
  const mk = (name: string, i: number) =>
    db.update(accounts).set({ sortOrder: i }).where(eq(accounts.name, name));
  const [first, ...rest] = orderedNames;
  await db.batch([mk(first, 0), ...rest.map((name, i) => mk(name, i + 1))]);
}
```
Keep `iconForAccount`/`hueForAccount`, `FALLBACK_ICON`, `ACCOUNT_ICONS`, `AccountIcon` unchanged. `accountIdFor` is already async.

- [ ] **Step 5: Run to verify pass** — `npm test -- src/features/accounts/` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/features/accounts/
git commit -m "refactor(accounts): async queries; setAccountOrder uses db.batch"
```

---

## Task 9: Convert `settings` to async

Four transactional upserts (`setCutoff`, `setIconSet`, `setCardFeePct`, `setFxRates`) → flat `db.batch([delete, insert])`. Getters await `.all()`. Pure validators (`isValidCutoffDay`, `isIconSet`, `isValidCardFeePct`, `isFxRates`) stay sync.

**Files:** Modify `src/features/settings/queries.ts`, `src/features/settings/schema.ts`; tests `queries.test.ts`, `schema.test.ts`, `data.test.ts`.

- [ ] **Step 1: Update tests** — `makeNodeProxyDb()`; `await` all `ensure*Table` + query calls; `async` callbacks. `data.test.ts` uses entries+categories+budgets ensures — await all three.

- [ ] **Step 2: `ensureSettingsTable` async** — `Promise<void>`, `await db.run(...)`.

- [ ] **Step 3: Run to verify fail** — `npm test -- src/features/settings/` → FAIL.

- [ ] **Step 4: Convert.** Getters (`getCutoff`, `getIconSet`, `getCardFeePct`, `getFxRates`) become `async`, `const [row] = await db.select()...all();`, keep the fallback logic. Each setter follows this shape (shown for `setCutoff`; apply identically with each key/value):
```ts
export async function setCutoff(db: Db, day: number): Promise<void> {
  await db.batch([
    db.delete(settings).where(eq(settings.key, CUTOFF_KEY)),
    db.insert(settings).values({ key: CUTOFF_KEY, value: String(day) }),
  ]);
}
```
- `setIconSet` → `ICON_SET_KEY`, value `value`.
- `setCardFeePct` → `CARD_FEE_KEY`, value `String(pct)`.
- `setFxRates` → `FX_RATES_KEY`, value `JSON.stringify(rates)`.

- [ ] **Step 5: Run to verify pass** — `npm test -- src/features/settings/` → PASS.

- [ ] **Step 6: Commit**
```bash
git add src/features/settings/
git commit -m "refactor(settings): async queries; setters use db.batch"
```

---

## Task 10: The DB Worker (WASM SQLite on OPFS)

The browser backend. Boots sqlite-wasm with the **SAHPool** OPFS VFS (no COOP/COEP headers), bootstraps all **six** tables, and answers `query`/`batch`/`export` with the same row shaping as the Node shim (Task 3).

**Files:** Create `src/db/worker.ts`

- [ ] **Step 1: Implement**

`src/db/worker.ts`:
```ts
/// <reference lib="webworker" />
import sqlite3InitModule, { type Sqlite3Static, type Database } from '@sqlite.org/sqlite-wasm';

type QueryMsg = { id: number; type: 'query'; sql: string; params: unknown[]; method: string };
type BatchMsg = { id: number; type: 'batch'; queries: { sql: string; params: unknown[]; method: string }[] };
type ExportMsg = { id: number; type: 'export' };
type ReadyMsg = { id: number; type: 'ready' };
type InMsg = QueryMsg | BatchMsg | ExportMsg | ReadyMsg;

const DB_FILE = '/moniflow.sqlite';
let api: Sqlite3Static | null = null;
let db: Database | null = null;

// ponytail: the six-table DDL is duplicated here (not imported from feature schema.ts) so db/ stays
// feature-free per the dependency rule — same trade the retired migrate.ts made. Kept in lockstep
// with the ensure*Table CREATEs by the OPFS smoke check (Task 12) + query tests (Node shim).
const BOOTSTRAP_SQL = [
  `CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
     time TEXT, account_id INTEGER, category_id INTEGER, amount REAL NOT NULL, currency TEXT,
     original_amount REAL, note TEXT, source TEXT NOT NULL DEFAULT 'manual')`,
  `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
     emoji TEXT NOT NULL, hue INTEGER, sort_order INTEGER, archived INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
     icon TEXT NOT NULL, hue INTEGER, sort_order INTEGER, archived INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, amount REAL NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trip_titles (id TEXT PRIMARY KEY, title TEXT NOT NULL)`,
];

function runStmt(sql: string, params: unknown[] = []): void {
  if (db === null) throw new Error('db not ready');
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) stmt.bind(params);
    stmt.step();
  } finally {
    stmt.finalize();
  }
}

function queryRows(sql: string, params: unknown[], method: string): unknown {
  if (method === 'run') {
    runStmt(sql, params);
    return [];
  }
  if (db === null) throw new Error('db not ready');
  const stmt = db.prepare(sql);
  const rows: unknown[] = [];
  try {
    if (params.length > 0) stmt.bind(params);
    while (stmt.step()) rows.push(stmt.get([]));
  } finally {
    stmt.finalize();
  }
  if (method === 'get') return rows[0] ?? [];
  return rows;
}

async function boot(): Promise<void> {
  api = await sqlite3InitModule();
  const pool = await api.installOpfsSAHPoolVfs({ name: 'moniflow-pool' });
  db = new pool.OpfsSAHPoolDb(DB_FILE);
  for (const ddl of BOOTSTRAP_SQL) runStmt(ddl);
}

let bootPromise: Promise<void> | null = null;
function ready(): Promise<void> {
  if (bootPromise === null) bootPromise = boot();
  return bootPromise;
}

self.addEventListener('message', (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  void ready().then(() => {
    try {
      if (msg.type === 'ready') {
        self.postMessage({ id: msg.id, ok: true });
      } else if (msg.type === 'query') {
        self.postMessage({ id: msg.id, ok: true, rows: queryRows(msg.sql, msg.params, msg.method) });
      } else if (msg.type === 'batch') {
        runStmt('BEGIN');
        try {
          const results = msg.queries.map((q) => ({ rows: queryRows(q.sql, q.params, q.method) }));
          runStmt('COMMIT');
          self.postMessage({ id: msg.id, ok: true, results });
        } catch (err) {
          runStmt('ROLLBACK');
          throw err;
        }
      } else if (msg.type === 'export') {
        if (api === null || db === null) throw new Error('db not ready');
        const bytes = api.capi.sqlite3_js_db_export(db);
        self.postMessage({ id: msg.id, ok: true, bytes }, [bytes.buffer]);
      }
    } catch (err) {
      self.postMessage({ id: msg.id, ok: false, error: String(err) });
    }
  });
});
```

> Version note: confirm `installOpfsSAHPoolVfs`, `OpfsSAHPoolDb`, and `capi.sqlite3_js_db_export` against `node_modules/@sqlite.org/sqlite-wasm/index.d.ts` for the installed version; adjust only those API lines. The message protocol + row shaping are fixed contracts the rest of the plan relies on.

- [ ] **Step 2: Typecheck** — `npm run typecheck`. Expected: no NEW errors in `src/db/worker.ts` (page/action errors from Task 4 remain until Plan 2).

- [ ] **Step 3: Commit**
```bash
git add src/db/worker.ts
git commit -m "feat(db): WASM SQLite worker on OPFS SAHPool bootstrapping the 6-table schema"
```

---

## Task 11: Main-thread RPC + `getBrowserDb()`

**Files:** Create `src/db/rpc.ts`, `src/db/browser.ts`

**Interfaces produced:** `getBrowserDb(): Promise<Db>`

- [ ] **Step 1: Implement the RPC wrapper**

`src/db/rpc.ts`:
```ts
type Pending = { resolve: (value: Record<string, unknown>) => void; reject: (reason: unknown) => void };

// One worker, one message-id counter, a map of in-flight requests. Every call resolves when the
// worker posts back the matching id.
export class DbWorkerRpc {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener(
      'message',
      (event: MessageEvent<{ id: number; ok: boolean; error?: string } & Record<string, unknown>>) => {
        const data = event.data;
        const p = this.pending.get(data.id);
        if (p === undefined) return;
        this.pending.delete(data.id);
        if (data.ok) p.resolve(data);
        else p.reject(new Error(String(data.error)));
      },
    );
  }

  send(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...payload });
    });
  }
}
```

- [ ] **Step 2: Implement `getBrowserDb()`**

`src/db/browser.ts`:
```ts
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { Db } from './client';
import { DbWorkerRpc } from './rpc';

let cached: Db | null = null;

// Browser entry point: the same sqlite-proxy driver as the Node shim, backed by the worker. Requests
// persistent storage so Chrome/Android does not evict the OPFS DB. Call once, reuse.
export async function getBrowserDb(): Promise<Db> {
  if (cached !== null) return cached;
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    await navigator.storage.persist();
  }
  const rpc = new DbWorkerRpc();
  await rpc.send({ type: 'ready' }); // force worker boot + table bootstrap before first query

  cached = drizzle(
    async (sql, params, method) => {
      const res = await rpc.send({ type: 'query', sql, params, method });
      return { rows: res.rows as unknown[] };
    },
    async (queries) => {
      const res = await rpc.send({ type: 'batch', queries });
      return (res.results as { rows: unknown[] }[]).map((r) => r.rows);
    },
  );
  return cached;
}
```

> `as unknown[]` / `as { rows }[]` here cross the untyped `postMessage` boundary — the one place the codebase's no-`as` rule can't hold (message payloads are structurally `unknown`). If the reviewer objects, replace with a typed narrowing helper (`isRowsArray(x)`), but do not use `!` or `any`.

- [ ] **Step 3: Typecheck** — no new errors in `src/db/rpc.ts`/`src/db/browser.ts`.

- [ ] **Step 4: Commit**
```bash
git add src/db/rpc.ts src/db/browser.ts
git commit -m "feat(db): main-thread worker RPC and getBrowserDb() proxy driver"
```

---

## Task 12: Browser smoke check (manual, gated)

No automated browser harness exists; verify the round-trip + OPFS persistence by hand once.

**Files:** Create (temporary) `src/app/db-smoke/page.tsx`

- [ ] **Step 1: Add a throwaway client page**

`src/app/db-smoke/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { insertEntry, getEntries } from '@features/entries/queries';

export default function DbSmoke() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    void (async () => {
      const db = await getBrowserDb();
      await insertEntry(db, {
        date: '2026-07-14', account: 'Cash', category: 'Test', amount: -1, source: 'manual',
      });
      setCount((await getEntries(db)).length);
    })();
  }, []);
  return <pre>entries in OPFS: {count ?? '…'}</pre>;
}
```
(Tables are bootstrapped by the worker at boot; category/account rows are created on the fly by `insertEntry`'s resolvers.)

- [ ] **Step 2: Run and verify in a real browser**

Run: `npm run dev:web`, open `http://127.0.0.1:4010/db-smoke`.
Expected: shows `entries in OPFS: N`, and **N increments by 1 on each reload** (proves OPFS persistence across loads). DevTools → Application → Storage shows OPFS usage. No console errors.

- [ ] **Step 3: Remove the throwaway page and commit the deletion**

```bash
git rm -r src/app/db-smoke
git commit -m "test(db): verified OPFS round-trip + persistence (smoke page removed)"
```

---

## Task 13: Repoint the CLI + seed onto the Node shim

`cli.ts` opens `initDb(opts.db)` (now deleted) and calls now-async queries synchronously. Repoint at `makeNodeProxyDb()` and `await`. The Node shim is in-memory, so file-backed CLI persistence is dropped — acceptable: the browser is the system of record and the CLI is dev-only.

**Files:** Modify `src/cli.ts`, `src/features/entries/seed.ts`

- [ ] **Step 1: Make `seedEntries` async** — in `seed.ts`: `export async function seedEntries(db: Db): Promise<number>` (keep its current return count), `await addEntries(db, ...)`.

- [ ] **Step 2: Make the CLI actions async** — in `cli.ts`: `import { makeNodeProxyDb } from '@db/client'`; each `.action(async (...) => {...})`; `const db = makeNodeProxyDb()`; `await ensureEntriesTable(db)` and every query call. `import` command: keep `readFileSync` + `parseMonefyCsv`, then `await replaceEntries(db, entries)`.

- [ ] **Step 3: Verify the CLI runs**

Run: `npm run dev -- seed` → prints "seeded N demo entries", no error.
Run: `npm run dev -- summary` → prints a count + formatted baht, no error. (In-memory, so `summary` reflects only what a single invocation seeds — expected.)

- [ ] **Step 4: Commit**
```bash
git add src/cli.ts src/features/entries/seed.ts
git commit -m "refactor(cli): run commands on the async node-proxy db"
```

---

## Task 14: Green gate for the whole data layer

**Files:** none (verification only)

- [ ] **Step 1: Full test suite** — `npm test`. Expected: PASS — all pure-logic tests + every DB-backed test file + `node-proxy.test.ts` green; no `migrate.test.ts`.

- [ ] **Step 2: Lint + format** — `npm run format:files "src/db/*.ts" "src/features/**/queries.ts" "src/features/**/schema.ts" "src/features/entries/seed.ts" "src/cli.ts"` then `npm run lint`. Expected: clean (no `any`/`as` outside the documented `browser.ts` boundary, no `!`, `type` over `interface`).

- [ ] **Step 3: Typecheck — expected residual** — `npm run typecheck`. Expected: the ONLY remaining errors are in `src/app/**/page.tsx` and `src/features/*/actions.ts` (still calling async queries synchronously / using Server Actions). Confirm every remaining error is in those files — that set is exactly Plan 2's scope. If any error is elsewhere, fix it before finishing.

- [ ] **Step 4: Commit any formatting**
```bash
git add -A
git commit -m "chore(db): format + lint pass for the async data layer"
```

---

## Self-Review

**Spec coverage:** WASM SQLite + OPFS persistence (Tasks 10–12 ✓); drizzle `sqlite-proxy` bridge (Tasks 3, 11 ✓); preserve schema + SQL semantics + tests (Tasks 5–9 keep query shapes, tests green ✓); the 13 transaction sites reclassified — flat batch / resolve-then-batch / interactive (Tasks 5–9, inventory table ✓); delete the legacy migration subsystem (Task 2 ✓); SAHPool VFS / no COOP-COEP + `persist()` (Tasks 10–11 ✓); CSV as carry-over — no schema migration crosses the boundary, so nothing in Plan 1 imports/needs `migrate.ts` (Task 2 ✓). Deferred to Plan 2 (client pages, Server Action replacement, Import/Export UI, PWA shell, static export, `force-dynamic` + `middleware.ts` removal) — explicitly out of scope, flagged in the header and Task 14's residual check.

**Placeholder scan:** No "TBD/handle errors/etc." The worker's API-name note points at the installed `.d.ts` behind a fixed message protocol; the mechanical read-conversion signatures are fully enumerated per file with the exact `await`-the-chain rule.

**Type consistency:** `Db = SqliteRemoteDatabase<Record<string, never>>` defined in Task 4, used verbatim throughout. Row shaping (`run`→`[]`, `get`→first-row-array, `all`/`values`→array-of-arrays) identical in the Node shim (Task 3 `one()`) and the worker (Task 10 `queryRows()`), consumed identically in `getBrowserDb` (Task 11). `db.batch` non-empty-tuple handled without `as` in every dynamic site (`replaceEntries`/`restoreEntries` via a leading `delete`; `undoMergeAccount`/`setCategoryOrder`/`setAccountOrder` via `[first, ...rest]`). `categoryIdFor`/`accountIdFor` async signature fixed in Task 5 and consumed by Tasks 6–9. `ensure*Table` async (`Promise<void>`) consistent across Tasks 5–9 and the worker's independent `BOOTSTRAP_SQL`.
