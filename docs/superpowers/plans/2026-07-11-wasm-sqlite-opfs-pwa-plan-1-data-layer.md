# WASM-SQLite/OPFS Migration — Plan 1: Async Data Layer + Browser Runtime

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert moniflow's data layer from synchronous server-side `better-sqlite3` to an async `sqlite-proxy` driver that runs WASM SQLite in a Web Worker persisted to OPFS — with every query test green — without yet touching the UI.

**Architecture:** One drizzle driver (`sqlite-proxy`, async) with two backends: a WASM-SQLite-on-OPFS Web Worker in the browser, and an in-memory `better-sqlite3` shim in Node (tests + CLI). All `queries.ts` functions become `async`; the 3 transactional ones convert to `db.batch()`. Pages/components/actions are NOT changed in this plan — the web UI is expected to be temporarily broken at the end of Plan 1 and is repaired in Plan 2. Tests and the CLI remain fully working throughout.

**Tech Stack:** `@sqlite.org/sqlite-wasm` (OPFS SAHPool VFS), `drizzle-orm/sqlite-proxy`, `better-sqlite3` (retained for Node shim + CLI), Vitest, TypeScript strict (no `any`/`as`/`!`).

**Scope boundary (Plan 2, written later):** client-component page conversion, replacing Server Actions with client writes + local refresh, the browser Import/Export UI, the PWA manifest/service worker, `next.config` static export, and `force-dynamic` removal. None of that is in Plan 1.

---

## File Structure

| File | Responsibility | Plan 1 action |
|---|---|---|
| `src/db/client.ts` | Public `Db` type + backend factories | **Rewrite** — `Db = SqliteRemoteDatabase`, re-export `makeNodeProxyDb()` |
| `src/db/node-proxy.ts` | Node `better-sqlite3`-backed proxy exec/batch (tests + CLI) | **Create** |
| `src/db/worker.ts` | Browser DB Worker: WASM SQLite on OPFS, query/batch/export + table bootstrap | **Create** |
| `src/db/rpc.ts` | Main-thread promise-per-message wrapper around the worker | **Create** |
| `src/db/browser.ts` | `getBrowserDb()` — builds the `sqlite-proxy` drizzle from `rpc.ts` | **Create** |
| `src/features/*/queries.ts` | Typed reads/writes | **Modify** — all fns `async`; 4 fns use `db.batch` |
| `src/features/*/schema.ts` | Table + `ensure*Table` bootstrap | **Modify** — `ensure*Table` async |
| DB-backed test files (7) | query/schema tests | **Modify** — `makeNodeProxyDb()` + `await` |
| `src/cli.ts` | commander CLI | **Modify** — `async` commands via `makeNodeProxyDb()` |
| `package.json` | deps | **Modify** — add `@sqlite.org/sqlite-wasm` |

---

## Task 1: Add the WASM SQLite dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install**

Run (Git Bash):
```bash
npm install @sqlite.org/sqlite-wasm
```

- [ ] **Step 2: Verify it resolved**

Run: `node -e "console.log(require('@sqlite.org/sqlite-wasm/package.json').version)"`
Expected: prints a version, no error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(db): add @sqlite.org/sqlite-wasm for browser SQLite"
```

---

## Task 2: Node proxy backend (`makeNodeProxyDb`)

The shim that makes the async `sqlite-proxy` driver run on in-memory `better-sqlite3` in Node. Every DB test and the CLI use it. It implements the exact row-shaping `sqlite-proxy` expects — the browser worker (Task 8) mirrors this shaping.

**Files:**
- Create: `src/db/node-proxy.ts`
- Create: `src/db/node-proxy.test.ts`

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
// Used by Vitest and the CLI so tests exercise the SAME async driver + row shaping that the
// browser worker (src/db/worker.ts) runs. Keep the row shaping identical across both backends.
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

## Task 3: Rewrite `db/client.ts` public surface

Change `Db` to the proxy database type so every `queries.ts` signature retypes in one place.

**Files:**
- Modify: `src/db/client.ts`

- [ ] **Step 1: Replace the file contents**

`src/db/client.ts`:
```ts
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

// The single public database type. Both backends (browser worker, node shim) are
// sqlite-proxy drivers, so features depend only on this — never on a concrete engine.
export type Db = SqliteRemoteDatabase<Record<string, never>>;

// Re-export the Node backend so the CLI and tests get a working Db without importing the
// browser worker. The browser entry point is src/db/browser.ts (getBrowserDb()).
export { makeNodeProxyDb } from './node-proxy';
```

- [ ] **Step 2: Typecheck (expected downstream breakage)**

Run: `npm run typecheck`
Expected: FAIL — many errors in `features/*/queries.ts` (their `.all()/.get()/.run()` now return promises against `Db`) and in `cli.ts`/pages/actions. Expected; Tasks 4–7 and 11 fix queries + CLI. Pages/actions are Plan 2. Note the error count to confirm it shrinks.

- [ ] **Step 3: Commit**

```bash
git add src/db/client.ts
git commit -m "refactor(db): Db type is now the async sqlite-proxy database"
```

---

## Task 4: Convert `entries/queries.ts` to async (includes the transaction case)

Every exported function gains `async`/`await`. `replaceEntries` converts `db.transaction` → `db.batch`. Signatures change only by wrapping the return in `Promise<...>`.

**Files:**
- Modify: `src/features/entries/queries.ts`, `src/features/entries/schema.ts`
- Modify: `src/features/entries/queries.test.ts`, `src/features/entries/entries.test.ts`

- [ ] **Step 1: Update both test files first**

In `queries.test.ts` and `entries.test.ts`:
- `import { initDb } from '@db/client'` → `import { makeNodeProxyDb } from '@db/client'`.
- Every `const db = initDb(':memory:')` → `const db = makeNodeProxyDb()`.
- `await` every `queries.ts` call and every `ensureEntriesTable(db)`; make each enclosing `it(...)` callback `async`.

- [ ] **Step 2: Make `ensureEntriesTable` async**

In `schema.ts`: `export function ensureEntriesTable(db: Db): void` → `export async function ensureEntriesTable(db: Db): Promise<void>`, and `await db.run(sql\`CREATE TABLE IF NOT EXISTS ...\`)`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/features/entries/queries.test.ts src/features/entries/entries.test.ts`
Expected: FAIL — query fns still sync / type mismatch.

- [ ] **Step 4: Convert `entries/queries.ts`** (exact verbatim new signatures)

```ts
export async function addEntries(db: Db, rows: NewEntry[]): Promise<void>
export async function getEntries(db: Db): Promise<Entry[]>
export async function getNetFlow(db: Db): Promise<number>            // await getEntries inside
export async function getEntriesInRange(db: Db, start: string, end: string): Promise<Entry[]>
export async function getCycleSummary(db: Db, start: string, end: string): Promise<Summary>  // await getEntriesInRange
export async function getCategoryBreakdown(db: Db, start: string, end: string): Promise<Breakdown[]>  // await groupSum
export async function insertEntry(db: Db, entry: NewEntry): Promise<void>
export async function updateEntry(db: Db, id: number, entry: NewEntry): Promise<void>
export async function deleteEntry(db: Db, id: number): Promise<void>
export async function getEntryById(db: Db, id: number): Promise<Entry | undefined>
export async function getDistinctCategories(db: Db): Promise<string[]>
export async function getDistinctAccounts(db: Db): Promise<string[]>
export async function getCategoryCounts(db: Db): Promise<CategoryCount[]>
export async function renameCategory(db: Db, from: string, to: string): Promise<void>
export async function searchEntries(db: Db, query: string): Promise<Entry[]>
export async function getForeignEntries(db: Db): Promise<Entry[]>
export async function replaceEntries(db: Db, rows: NewEntry[]): Promise<void>
```

- Read fns: `await` the drizzle chain (`return await db.select()...all()`).
- `groupSum` → `async function groupSum(...): Promise<Breakdown[]>`, `await`ed by callers. `summarize` stays a pure sync helper.
- **`replaceEntries` — transaction → batch:**

```ts
export async function replaceEntries(db: Db, rows: NewEntry[]): Promise<void> {
  const CHUNK = 500; // SQLite bound-variable cap guard (unchanged rationale)
  const inserts = Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) =>
    db.insert(entries).values(rows.slice(i * CHUNK, i * CHUNK + CHUNK)),
  );
  // ponytail: db.batch runs the array in one BEGIN..COMMIT; replaces db.transaction which the
  // sqlite-proxy driver does not support. Empty-rows case is just [delete], still valid.
  await db.batch([db.delete(entries), ...inserts]);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/features/entries/queries.test.ts src/features/entries/entries.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/queries.ts src/features/entries/schema.ts src/features/entries/queries.test.ts src/features/entries/entries.test.ts
git commit -m "refactor(entries): async queries over sqlite-proxy; replaceEntries uses db.batch"
```

---

## Task 5: Convert `budgets/queries.ts` to async

**Files:**
- Modify: `src/features/budgets/queries.ts`, `src/features/budgets/schema.ts`
- Modify: `src/features/budgets/queries.test.ts`, `src/features/budgets/schema.test.ts`

- [ ] **Step 1: Update tests** — `initDb(':memory:')` → `makeNodeProxyDb()`, `await` every query call + `ensureBudgetsTable`, callbacks `async`.

- [ ] **Step 2: Run to verify fail** — `npm test -- src/features/budgets/` → FAIL.

- [ ] **Step 3: Convert** (verbatim signatures):
```ts
export async function ensureBudgetsTable(db: Db): Promise<void>   // schema.ts, await db.run(...)
export async function getBudgets(db: Db): Promise<Budget[]>
export async function setBudget(db: Db, category: string | null, amount: number): Promise<void>
export async function deleteBudget(db: Db, category: string | null): Promise<void>
```
`setBudget` — `db.transaction` (delete matching row + insert) → batch:
```ts
export async function setBudget(db: Db, category: string | null, amount: number): Promise<void> {
  const where = category === null ? isNull(budgets.category) : eq(budgets.category, category);
  await db.batch([db.delete(budgets).where(where), db.insert(budgets).values({ category, amount })]);
}
```

- [ ] **Step 4: Run to verify pass** — `npm test -- src/features/budgets/` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/features/budgets/
git commit -m "refactor(budgets): async queries; setBudget uses db.batch"
```

---

## Task 6: Convert `categories/queries.ts` to async (upserts + PRAGMA migration)

No `db.transaction` (uses `onConflictDoUpdate`), but `ensureCategoryMetaTable` does a runtime `PRAGMA table_info` read + conditional `ALTER TABLE` — that read becomes `await`.

**Files:**
- Modify: `src/features/categories/queries.ts`, `src/features/categories/schema.ts`
- Modify: `src/features/categories/queries.test.ts`

- [ ] **Step 1: Update tests** — `makeNodeProxyDb()` + `await` all calls incl. `ensureCategoryMetaTable`, callbacks `async`.

- [ ] **Step 2: Run to verify fail** — `npm test -- src/features/categories/` → FAIL.

- [ ] **Step 3: Convert** (verbatim signatures):
```ts
export async function getEmojiMap(db: Db): Promise<Record<string, string>>
export async function setCategoryEmoji(db: Db, category: string, emoji: string): Promise<void>
export async function getHueMap(db: Db): Promise<Record<string, number>>
export async function setCategoryHue(db: Db, category: string, hue: number | null): Promise<void>
```
`setCategoryEmoji`/`setCategoryHue`: keep `.onConflictDoUpdate(...)`, add `await ... .run()`.
`ensureCategoryMetaTable` (schema.ts) becomes `async`: `await db.run(CREATE TABLE ...)`, then `const cols = await db.all(sql\`PRAGMA table_info(category_meta)\`)`; if `hue` absent, `await db.run(sql\`ALTER TABLE category_meta ADD COLUMN hue INTEGER\`)`. Keep the `typeof c === 'object' && 'name' in c` guard.

- [ ] **Step 4: Run to verify pass** — `npm test -- src/features/categories/` → PASS (7 cases).

- [ ] **Step 5: Commit**
```bash
git add src/features/categories/
git commit -m "refactor(categories): async queries + async PRAGMA-based hue migration"
```

---

## Task 7: Convert `settings/queries.ts` to async

Two transactional upserts (`setCutoff`, `setIconSet`) → `db.batch`.

**Files:**
- Modify: `src/features/settings/queries.ts`, `src/features/settings/schema.ts`
- Modify: `src/features/settings/queries.test.ts`, `src/features/settings/schema.test.ts`

- [ ] **Step 1: Update tests** — `makeNodeProxyDb()` + `await` + `async` callbacks.

- [ ] **Step 2: Run to verify fail** — `npm test -- src/features/settings/` → FAIL.

- [ ] **Step 3: Convert** (verbatim signatures):
```ts
export async function ensureSettingsTable(db: Db): Promise<void>   // schema.ts
export async function getCutoff(db: Db): Promise<number>
export async function setCutoff(db: Db, day: number): Promise<void>
export async function getIconSet(db: Db): Promise<IconSet>
export async function setIconSet(db: Db, value: IconSet): Promise<void>
```
`setCutoff` — replace `db.transaction((tx) => { delete key; insert {key,value} })` with:
```ts
await db.batch([
  db.delete(settings).where(eq(settings.key, CUTOFF_KEY)),
  db.insert(settings).values({ key: CUTOFF_KEY, value: String(day) }),
]);
```
(and the analogous `ICON_SET_KEY`/`value` pair in `setIconSet`). `getCutoff`/`getIconSet`: `await db.select()...all()`, destructure `[row]` as before, keep default fallbacks (`DEFAULT_CUTOFF`, default icon set).

- [ ] **Step 4: Run to verify pass** — `npm test -- src/features/settings/` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/features/settings/
git commit -m "refactor(settings): async queries; setCutoff/setIconSet use db.batch"
```

---

## Task 8: The DB Worker (WASM SQLite on OPFS)

The browser backend. Boots sqlite-wasm with the **SAHPool** OPFS VFS (no COOP/COEP headers needed), bootstraps all four tables, and answers `query` / `batch` / `export` messages with the *same row shaping* as the Node shim (Task 2). Uses the prepared-statement API (`prepare`/`step`/`get`/`finalize`).

**Files:**
- Create: `src/db/worker.ts`

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

// CREATE TABLE IF NOT EXISTS for all four tables, run once at boot. Kept here (not imported
// from feature schema.ts) so the worker stays free of feature imports per the dependency rule.
const BOOTSTRAP_SQL = [
  `CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
     time TEXT, account TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL,
     currency TEXT, original_amount REAL, note TEXT, source TEXT NOT NULL DEFAULT 'manual')`,
  `CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, amount REAL NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS category_meta (category TEXT PRIMARY KEY, emoji TEXT NOT NULL, hue INTEGER)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

// Statement with no result set (DDL, INSERT/UPDATE/DELETE, BEGIN/COMMIT/ROLLBACK).
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

// Query returning rows as arrays of column values — the shape sqlite-proxy expects.
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no NEW errors originating in `src/db/worker.ts` (page/action errors from Task 3 remain until Plan 2).

- [ ] **Step 3: Commit**

```bash
git add src/db/worker.ts
git commit -m "feat(db): WASM SQLite worker on OPFS SAHPool with query/batch/export"
```

---

## Task 9: Main-thread RPC + `getBrowserDb()`

**Files:**
- Create: `src/db/rpc.ts`
- Create: `src/db/browser.ts`

- [ ] **Step 1: Implement the RPC wrapper**

`src/db/rpc.ts`:
```ts
type Pending = { resolve: (value: Record<string, unknown>) => void; reject: (reason: unknown) => void };

// One worker, one message-id counter, a map of in-flight requests. Every call resolves when
// the worker posts back the matching id.
export class DbWorkerRpc {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', (event: MessageEvent<{ id: number; ok: boolean; error?: string } & Record<string, unknown>>) => {
      const data = event.data;
      const p = this.pending.get(data.id);
      if (p === undefined) return;
      this.pending.delete(data.id);
      if (data.ok) p.resolve(data);
      else p.reject(new Error(String(data.error)));
    });
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

// Browser entry point: the same sqlite-proxy driver as the Node shim, backed by the worker.
// Requests persistent storage so Chrome/Android does not evict the OPFS DB. Call once, reuse.
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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no new errors in `src/db/rpc.ts` / `src/db/browser.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/db/rpc.ts src/db/browser.ts
git commit -m "feat(db): main-thread worker RPC and getBrowserDb() proxy driver"
```

---

## Task 10: Browser smoke check (manual, gated)

No automated browser harness exists; verify the round-trip by hand once.

**Files:**
- Create (temporary): `src/app/db-smoke/page.tsx`

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
        date: '2026-07-11', account: 'Cash', category: 'Test', amount: -1, source: 'manual',
      });
      setCount((await getEntries(db)).length);
    })();
  }, []);
  return <pre>entries in OPFS: {count ?? '…'}</pre>;
}
```
(Tables are bootstrapped by the worker at boot, so no `ensureEntriesTable` call is needed here.)

- [ ] **Step 2: Run and verify in a real browser**

Run: `npm run dev:web`, open `http://127.0.0.1:4010/db-smoke`.
Expected: shows `entries in OPFS: N`, and N **increments by 1 on each reload** (proves OPFS persistence across loads). DevTools → Application → Storage shows the OPFS usage. No console errors.

- [ ] **Step 3: Remove the throwaway page and commit the deletion**

```bash
rm -r src/app/db-smoke
git add -A src/app/db-smoke
git commit -m "test(db): verified OPFS round-trip + persistence (smoke page removed)"
```

---

## Task 11: Repoint the CLI onto the Node shim

`cli.ts` opens `initDb(opts.db)` (a real file) and calls now-async queries synchronously. Repoint at `makeNodeProxyDb()` and `await`. Keeps `summary`/`seed`/`import` working for local dev. Note: the Node shim is in-memory, so file-backed CLI persistence is dropped — acceptable since the browser is now the system of record and the CLI is dev-only.

**Files:**
- Modify: `src/cli.ts`
- Modify: `src/features/entries/seed.ts` (if `seedEntries` calls `addEntries`, it becomes async)

- [ ] **Step 1: Make the CLI actions async** — in `src/cli.ts`: `initDb(opts.db)` → `makeNodeProxyDb()` in all three commands; each `.action(async (...) => {...})`; `await ensureEntriesTable(db)` and every query call. `import`: keep `readFileSync` + `parseMonefyCsv`, then `await replaceEntries(db, entries)`.

- [ ] **Step 2: Make `seedEntries` async** — `src/features/entries/seed.ts`: `export async function seedEntries(db: Db): Promise<...>`, `await addEntries(...)`.

- [ ] **Step 3: Verify the CLI runs**

Run: `npm run dev -- summary`
Expected: prints a count + formatted baht, no error.
Run: `npm run dev -- seed && echo ok`
Expected: `ok`, no error.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts src/features/entries/seed.ts
git commit -m "refactor(cli): run commands on the async node-proxy db"
```

---

## Task 12: Green gate for the whole data layer

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — all pure-logic tests + all 7 DB-backed test files + `node-proxy.test.ts` green.

- [ ] **Step 2: Lint + format the changed files**

Run: `npm run format:files "src/db/*.ts" "src/features/**/queries.ts" "src/features/**/schema.ts" "src/features/entries/seed.ts" "src/cli.ts"` then `npm run lint`
Expected: lint passes (no `any`/`as`/`!`, `type` over `interface`).

- [ ] **Step 3: Typecheck — expected residual**

Run: `npm run typecheck`
Expected: the ONLY remaining errors are in `src/app/**/page.tsx` and `src/features/*/actions.ts` (still calling async queries synchronously / using Server Actions). Confirm every remaining error is in those files — that set is exactly Plan 2's scope. If any error is elsewhere, fix it before finishing.

- [ ] **Step 4: Commit any formatting**

```bash
git add -A
git commit -m "chore(db): format + lint pass for the async data layer"
```

---

## Self-Review

**Spec coverage (Plan 1 portion):** WASM SQLite + OPFS persistence (Tasks 8–10 ✓); drizzle `sqlite-proxy` bridge (Tasks 2, 9 ✓); preserve schema + SQL semantics + tests (Tasks 4–7 keep query shapes, tests green ✓); `db.batch` for the 3 transaction sites (Tasks 4, 5, 7 ✓); SAHPool VFS / no COOP-COEP (Task 8 ✓); `persist()` (Task 9 ✓). Deferred to Plan 2 (client pages, Server Action replacement, Import/Export UI, PWA shell, static export, `force-dynamic` removal) — explicitly out of scope, flagged in the header and Task 12's residual check.

**Placeholder scan:** No "TBD/add error handling/etc." Task 8's API-name note points at the installed `.d.ts` rather than inventing an API, and sits behind a fully-specified message protocol + row shaping.

**Type consistency:** `Db = SqliteRemoteDatabase<Record<string, never>>` defined in Task 3, used verbatim in Tasks 4–9. Row shaping (`run`→`[]`, `get`→first-row-array, `all`/`values`→array-of-arrays) is identical in the Node shim (Task 2, `one()`), the worker (Task 8, `queryRows()`), and consumed identically in `getBrowserDb` (Task 9). `db.batch` contract (array of statements → array of `{rows}`) consistent across worker, shim, and driver. `ensure*Table` async signature consistent across Tasks 4–7 and Tasks 10–11.
