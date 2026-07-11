# Design: Client-side WASM-SQLite / OPFS PWA migration

- **Date:** 2026-07-11
- **Status:** Approved (design) — pending implementation plan
- **Branch:** `feat/wasm-sqlite-opfs-pwa`

## Context

Moniflow today is a server-rendered Next.js app: Server Components read a server-side
SQLite file (`data/moniflow.db`) directly via `better-sqlite3` + drizzle, mutations go
through Server Actions, and a commander CLI imports the Monefy CSV into that same file.
Reaching it from a phone requires running an always-on host (Docker) and a tunnel
(Tailscale).

The user wants, on a **single Android device**, to: (A) stop running a server/always-on
box, (B) work fully offline, and (C) have it feel like a real installed app. Single-device
use removes the only real objection to browser-local storage (no cross-device sync needed).

## Decision

Migrate to a **client-side PWA** whose data lives entirely in the browser, using
**SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`) persisted to OPFS**, with
**drizzle's `sqlite-proxy` driver** bridging the UI (main thread) to the DB (Web Worker).

This was chosen over raw IndexedDB (Approach 2) because it **preserves the existing SQL
query logic, schema, and tests** — IndexedDB has no SQL and would force a hand-rewrite of
all aggregation (cycle grouping, donut sums, search). It was chosen over a PWA-wrap of the
current server app (Approach 3) because that cannot deliver true offline (goal B).

## Goals

- All data stored locally in the browser via OPFS; no server database.
- Fully offline-capable, installable PWA on Android/Chrome.
- Preserve the schema, the SQL semantics of `queries.ts`, and all pure-logic modules + tests.
- A first-class **Export/Import** path (disaster recovery + Monefy CSV import).

## Non-goals

- Cross-device sync (explicitly single-device; A chosen over B/C in the device question).
- iOS support tuning (target is Android; iOS eviction quirks out of scope).
- Multi-user / authentication (app remains single-user, now with no network surface at all).

## Key architectural constraint (why a Worker)

OPFS's durable, fast mode exposes a **synchronous** file handle
(`createSyncAccessHandle`), which the browser permits **only inside a Web Worker**.
SQLite's engine is synchronous and wants exactly that handle. Therefore the database runs
in a dedicated **DB Worker**; the UI communicates with it by message-passing. This is a
platform constraint, not a stylistic choice.

## Architecture: what changes, what stays

| Layer | Fate |
|---|---|
| Pure modules — cycle math, donut builder, breakdown, calc, trips, combobox (+ tests) | **Unchanged** — data-in/data-out, DB-agnostic |
| `features/*/schema.ts` (drizzle tables + `ensure*Table` DDL) | **Unchanged** — same SQLite dialect |
| `features/*/queries.ts` | **Same SQL, now async** — query builder shapes preserved; `.all()`/`.get()` → `await` |
| `db/client.ts` (better-sqlite3 connection) | **Replaced** — builds a drizzle `sqlite-proxy` driver that talks to the DB Worker |
| `features/*/actions.ts` (Server Actions) | **Replaced** — direct async client writes; no `revalidatePath` |
| Server Components / SSR / `export const dynamic = 'force-dynamic'` | **Replaced** — pages become client components that load via hooks |
| CLI import (`cli.ts`, commander) | **Retired / repurposed** — CSV import moves into the browser file-picker |
| React components, layout shell, Tailwind, routing, URL-search-param interactivity | **Mostly unchanged** — Next kept as a static-exported shell |
| `next.config.ts` | Flips to **static export** (`output: 'export'`); drops `serverExternalPackages` |

## The DB access mechanism

```
UI (client component)
  → custom hook (e.g. use-entries)
    → queries.ts            [drizzle query builder — same shapes, now async]
      → drizzle sqlite-proxy driver
        → RPC glue: postMessage({ sql, params, method })
          → DB Worker: @sqlite.org/sqlite-wasm on OPFS
              runs SQL synchronously, returns { rows }
```

New modules introduced (and only these):

1. **`db/worker.ts`** — the DB Worker. Boots `sqlite-wasm`, opens/creates the OPFS database
   file, runs each feature's `ensure*Table` DDL on init, and executes SQL requests,
   returning rows in the shape drizzle-proxy expects (respecting `method` = `all | get |
   run | values`).
2. **`db/rpc.ts`** (or folded into `client.ts`) — main-thread ↔ worker request/response
   glue (a promise per message id).
3. **`db/client.ts`** (rewritten) — constructs `drizzle(sqliteProxy(async (sql, params,
   method) => rpc(sql, params, method)))` and exports the `Db` handle, same public surface
   feature `queries.ts` already import.

## Data flow

**Boot:** app loads → main thread starts the DB Worker → worker opens the OPFS file, runs
DDL bootstrap, signals ready → `navigator.storage.persist()` is requested → UI unblocks.

**Read:** client component → custom hook → `queries.ts` (async) → proxy → worker → rows →
feed the existing pure builders (donut/breakdown/cycle) → render. First paint shows a brief
load state while the worker boots (no SSR of data).

**Write:** keypad/edit → async write fn → worker `INSERT/UPDATE/DELETE` → the calling hook
**re-runs its queries** to refresh (replacing `revalidatePath`). A small client data layer
(a hook that owns load + mutate + reload, or a tiny store) is the invalidation mechanism.

**Interactivity:** URL-search-param navigation (cycle, filters, search, view) survives —
changing params re-runs the client queries against the worker DB instead of re-rendering a
server tree.

## Durability & backup (non-negotiable)

- `navigator.storage.persist()` on boot to resist eviction under storage pressure.
- **Export:** read the OPFS database bytes → `Blob` → download a `.sqlite` file.
- **Import:** load a `.sqlite` file back into OPFS, **or** parse a Monefy CSV in-browser and
  insert rows. This single feature is both disaster recovery and the replacement for the
  retired CLI importer. OPFS is private/invisible to the user's file manager, so this is the
  only door for data to leave the sandbox — it ships in the first implementation slice, not
  later.

## Testing strategy

- Pure-module Vitest tests: **unchanged.**
- `queries.ts` tests: run against the **same `sqlite-proxy` async driver that ships**, backed
  by an in-memory `better-sqlite3` shim in Node (`makeNodeProxyDb()`). This exercises the exact
  async code path (including `db.batch`) rather than a separate sync driver. Test files switch
  `initDb(':memory:')` → `makeNodeProxyDb()` and add `await` — a one-time mechanical change to
  the 7 DB-backed test files.
- New worker/RPC glue: a thin smoke test that a round-trip `INSERT` then `SELECT` returns the
  row; heavier verification is manual in-browser.

## Transactions & the async driver

`sqlite-proxy` has no interactive `db.transaction(cb)`. The 3 transactional query functions
(`replaceEntries`, `setBudget`, `setCutoff`/`setIconSet`) convert from `db.transaction(...)`
to **`db.batch([...])`** — an array of statements the driver's batch callback wraps in a
single `BEGIN…COMMIT` (in the worker for the browser; in a `better-sqlite3` transaction for
the Node shim). Persistence uses the **OPFS SAHPool VFS**, which needs no COOP/COEP headers,
so static hosting works unchanged.

## Retired

`better-sqlite3`, the Server Actions and their `revalidatePath` calls, `force-dynamic`, and
the commander CSV import path. `next.config.ts` moves to static export.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Worker + proxy RPC is the one genuinely novel piece | Isolate it in `db/worker.ts` + `db/rpc.ts`; single smoke test; documented pattern |
| Data loss (single browser store) | Export/Import ships first; `persist()`; export is a plain file copy |
| WASM bundle (~1MB) on first load | Cached by the service worker after first visit; acceptable for a PWA |
| Loss of SSR → visible load state | Acceptable for a personal single-device app; keep the worker boot fast |
| async query ripple touches every `queries.ts` fn | Mechanical; SQL shapes unchanged; covered by existing query tests |

## Open questions (resolve during planning)

- Client data-refresh mechanism: a per-feature `use-*` hook that owns reload, vs. a single
  tiny shared store. Lean: per-feature hooks (matches the existing "custom hooks are
  first-class" convention).
- Keep the commander CLI as a dev-only tool against a scratch DB, or delete it outright.
- Service-worker/manifest tooling: hand-rolled minimal manifest + SW, vs. `next-pwa`-style
  helper. Lean: minimal hand-rolled (fewer deps, YAGNI).

## Out of scope / superseded

The uncommitted Docker files (`Dockerfile`, `docker-compose.yml`, `.dockerignore`) on the
previous line of work are **superseded** by this design — a client-side PWA has no server to
containerize. Decide their fate (delete vs. keep for a fallback self-host) separately.
