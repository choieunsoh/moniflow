# Design: Client-side WASM-SQLite / OPFS PWA migration

- **Date:** 2026-07-11 · **Refreshed:** 2026-07-14
- **Status:** Approved (design) — Plan 1 to be regenerated from this refresh
- **Branch:** `feat/wasm-sqlite-opfs-pwa`

> **2026-07-14 refresh note.** The original design predates three shipped features —
> **first-class accounts** (surrogate `account_id`), the **surrogate-id category model**
> (`category_id` + `categories`/`accounts` tables, replacing the old text keys and
> `category_meta`), and **keypad currency**. It also predates the **Monefy CSV
> export/restore** backup, which is now the data carry-over + backup seam. This refresh
> updates the table inventory (4 → 6 tables), the transaction story (3 → ~9 sites, several
> *interactive*), the fate of the legacy migration code (now **deleted**, not ported), and
> adds a **data carry-over** section and a **Google Drive backup** forward-compat note.

## Context

Moniflow today is a server-rendered Next.js app: Server Components read a server-side
SQLite file (`data/moniflow.db`) directly via `better-sqlite3` + drizzle, mutations go
through Server Actions, and a commander CLI imports the Monefy CSV into that same file.
Reaching it from a phone requires running an always-on host (Docker) and a tunnel
(Tailscale).

The user wants, on a **single Android device**, to: (A) stop running a server/always-on
box, (B) work fully **offline-first**, and (C) have it feel like a real installed app.
Single-device use removes the only real objection to browser-local storage (no cross-device
sync needed). This was reconfirmed on 2026-07-14: offline-first single-device is the goal;
multi-device/hosted-DB (Turso) was explicitly rejected as the wrong spine.

## Decision

Migrate to a **client-side PWA** whose data lives entirely in the browser, using
**SQLite compiled to WebAssembly (`@sqlite.org/sqlite-wasm`) persisted to OPFS**, with
**drizzle's `sqlite-proxy` driver** bridging the UI (main thread) to the DB (Web Worker).

Chosen over raw IndexedDB (which has no SQL and would force a hand-rewrite of every
aggregation — cycle grouping, donut sums, breakdowns, search) and over a PWA-wrap of the
current server app (which cannot deliver true offline, goal B).

A welcome side effect: because OPFS starts empty and gets the **final surrogate-id schema**
directly, the entire **legacy migration subsystem** (`db/migrate.ts` + `db/migrate.test.ts`,
which upgraded text-keyed DBs to `category_id`/`account_id`) becomes dead code and is
**deleted**. The migration removes code on net.

## Goals

- All data stored locally in the browser via OPFS; no server database.
- Fully offline-capable, installable PWA on Android/Chrome.
- Preserve the schema, the SQL semantics of every `queries.ts`, and all pure-logic modules + tests.
- Keep the shipped **Monefy CSV export/restore** as both the **data carry-over path** (existing
  `data/moniflow.db` → new OPFS store) and disaster-recovery backup.

## Non-goals

- Cross-device sync (explicitly single-device — the offline-first spine, reconfirmed 2026-07-14).
- iOS support tuning (target is Android; iOS OPFS eviction quirks out of scope).
- Multi-user / authentication (single-user, now with no network surface at all).
- Google Drive backup — a **planned follow-on** with its own spec, not this migration (see below).

## The current schema (source of truth for the worker bootstrap)

Six tables, all in final surrogate-id shape:

| Table | Columns |
|---|---|
| `entries` | `id`, `date`, `time`, `account_id`, `category_id`, `amount`, `currency`, `original_amount`, `note`, `source` |
| `categories` | `id`, `name` (UNIQUE), `emoji`, `hue`, `sort_order`, `archived` |
| `accounts` | `id`, `name` (UNIQUE), `icon`, `hue`, `sort_order`, `archived` |
| `budgets` | `id`, `category_id` (NULL = total budget), `amount` |
| `settings` | `key` (PK), `value` |
| `trip_titles` | `id` (PK, `${currency}:${start}`), `title` |

The worker's `BOOTSTRAP_SQL` (`CREATE TABLE IF NOT EXISTS` for all six, in this exact shape)
replaces the per-feature `ensure*Table` DDL and the deleted migration. Feature `ensure*Table`
functions simplify to a plain `CREATE TABLE IF NOT EXISTS` (async) with **no `migrate*` calls**
— and `ensureCategoriesTable`/`ensureAccountsTable`, which today have *no* `CREATE` (they lean
on `migrate.ts` to create the table), gain a real `CREATE TABLE` statement.

## Key architectural constraint (why a Worker)

OPFS's durable, fast mode exposes a **synchronous** file handle
(`createSyncAccessHandle`), which the browser permits **only inside a Web Worker**.
SQLite's engine is synchronous and wants exactly that handle. Therefore the database runs
in a dedicated **DB Worker**; the UI communicates by message-passing. Platform constraint,
not a stylistic choice.

## Architecture: what changes, what stays

| Layer | Fate |
|---|---|
| Pure modules — cycle math, donut/breakdown builders, calc, trips, combobox, keypad-lists (+ tests) | **Unchanged** — data-in/data-out, DB-agnostic |
| `features/*/schema.ts` (drizzle tables) | **Unchanged tables**; `ensure*Table` becomes async + drops all `migrate*` calls |
| `features/*/queries.ts` (entries, budgets, categories, accounts, settings) | **Same SQL, now async** — `.all()/.get()/.run()` → `await`; transactions reworked (below) |
| `db/migrate.ts`, `db/migrate.test.ts` | **Deleted** — legacy-only; OPFS bootstraps final shape directly |
| `db/client.ts` (better-sqlite3 `initDb`) | **Replaced** — `Db` becomes the `sqlite-proxy` type; re-exports the Node shim |
| `features/*/actions.ts` (Server Actions) | **Replaced** (Plan 2) — direct async client writes; no `revalidatePath` |
| Server Components / SSR / `force-dynamic` | **Replaced** (Plan 2) — pages become client components loading via hooks |
| `src/middleware.ts` (Basic-auth gate) | **Deleted** (Plan 2) — static export has no server, and offline-first ships **zero data** to the host, so the public URL exposes only an empty app shell |
| CLI import (`cli.ts`) | **Repurposed** — runs on the Node shim (dev-only); CSV import also moves into the browser file-picker |
| React components, layout shell, Tailwind, URL-search-param routing | **Mostly unchanged** — Next kept as a static-exported shell |
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

New modules (and only these): `db/worker.ts` (boots `sqlite-wasm`, opens the OPFS DB, runs
`BOOTSTRAP_SQL`, executes `query`/`batch`/`export`), `db/rpc.ts` (main-thread promise-per-message
glue), `db/browser.ts` (`getBrowserDb()` — builds the `sqlite-proxy` drizzle from the RPC),
`db/node-proxy.ts` (`makeNodeProxyDb()` — the same async driver over in-memory `better-sqlite3`
for tests + CLI). `db/client.ts` shrinks to the `Db` type + a re-export of the Node shim.

## Transactions & the async driver — the load-bearing change

`sqlite-proxy` has **no interactive `db.transaction(cb)`**. It offers a `db.batch([...])` —
a flat array of statements the driver wraps in one `BEGIN…COMMIT`. Every current
`db.transaction` site must be reclassified:

**Flat write-only → `db.batch([...])` directly:**
- `settings.setCutoff`, `settings.setIconSet` — `[delete key, insert {key,value}]`
- `budgets.setBudget` — `[delete matching, insert]`

**Resolve-then-batch** (name→id resolution may *create* category/account rows, so it runs —
awaited — *before* the batch, then the entry writes batch):
- `entries.replaceEntries` — `await resolve names → db.batch([delete source='monefy', ...chunked inserts])`
- `entries.restoreEntries` — same, `delete` all rows

**Interactive (read → decide in JS → batch writes)** — these *cannot* be a flat batch:
- `entries.renameCategory` — read source/target/target-budget → decide rename vs merge → batch the merge writes
- `entries.deleteCategory` — guard-read (is it used?) → batch `[delete budget, delete category]`
- `entries.mergeAccountInto` — read source/target/`movedIds` → batch `[update entries, delete account]` → return snapshot
- `entries.undoMergeAccount` — `await` recreate account → `await` read new id → batch the id reassignments

Splitting an interactive transaction into `awaited reads → db.batch(writes)` trades away
atomicity **between** the read and write phases (the write batch itself stays atomic). In a
**single-user, single-tab** PWA there is exactly one serial writer, so the exposed gap is a
second user-triggered mutation interleaving mid-await — narrow and, at worst, a recoverable
no-op, never corruption.

> `ponytail:` accept the read→write gap for now; a single in-flight-mutation lock in the
> client data layer closes it if it ever bites. The heavier alternative (move query logic
> into the worker to regain true interactive transactions) is rejected — it couples the
> worker to features and breaks the dependency rule.

Name→id helpers `categoryIdFor`/`accountIdFor` (get-or-create) become **async** and are
`await`ed during the resolve phase; `toRow`/`toRows` follow.

## Data carry-over (existing `data/moniflow.db` → OPFS)

No schema migration crosses the boundary. The path is the shipped CSV seam:

1. In the **current** server app, `GET /settings/backup/export` downloads the ledger as Monefy CSV.
2. In the **new** PWA, the in-browser CSV import (`parseMonefyCsv` → `restoreEntries`) rebuilds
   everything in final shape — categories/accounts are recreated on the fly by the get-or-create
   resolvers.

Budgets and cutoff/icon settings are trivial to re-enter (a handful of values); the CSV carries
the ledger, which is the only bulk data. This is why deleting `migrate.ts` is safe: the browser
never needs to upgrade a legacy DB.

## Durability & backup

- `navigator.storage.persist()` on boot to resist eviction under storage pressure.
- **Primary backup: the shipped Monefy CSV export/restore** (`serializeMonefyCsv` /
  `restoreEntries`) — human-readable, Monefy-interoperable, and the payload a future Drive
  backup uploads.
- **Optional secondary: raw `.sqlite` export** — read the OPFS DB bytes → `Blob` → download.
  A faithful whole-DB snapshot (carries budgets/settings/trip titles too). Ships only if the
  CSV round-trip proves insufficient; not required for the first slice.

## Google Drive backup (forward-compat note — separate future spec)

Decided 2026-07-14: a follow-on feature, **not** part of this migration. Design intent so the
migration doesn't foreclose it:

- **Payload:** the CSV string from `serializeMonefyCsv` (already the "string-is-the-seam").
- **Transport:** client-side Google Identity Services OAuth, `drive.appdata` scope (a hidden
  per-app folder). No server.
- **Trigger:** auto-backup **on change (debounced) + on app open**, plus manual
  "Back up now" / "Restore from Drive" on `/settings`. *Not* an unattended cron — a static PWA
  has no server, and client-side OAuth issues no refresh token, so a background job can't
  silently renew an expired token. On-change/on-open covers ~95% of the value with zero server.

## Testing strategy

- Pure-module Vitest tests: **unchanged.**
- `queries.ts` tests: run against the **same `sqlite-proxy` async driver that ships**, backed by
  the in-memory `better-sqlite3` shim (`makeNodeProxyDb()`). Exercises the exact async path
  (including `db.batch` and the resolve-then-batch / read-then-batch rewrites). DB-backed test
  files switch `initDb(':memory:')` → `makeNodeProxyDb()` and add `await`.
- `db/migrate.test.ts` is **deleted** with `db/migrate.ts`.
- New worker/RPC glue: a thin smoke test that an `INSERT` then `SELECT` round-trips; heavier
  verification is manual in-browser.

## Persistence VFS

Uses the **OPFS SAHPool VFS**, which needs no COOP/COEP headers, so static hosting works
unchanged.

## Retired / deleted

`better-sqlite3` (browser side; retained for the Node shim + CLI), `db/migrate.ts` +
`db/migrate.test.ts`, `db/client.ts`'s `initDb`, the Server Actions and their `revalidatePath`,
`force-dynamic`, `src/middleware.ts`, and the commander CSV import as the *primary* path.
`next.config.ts` moves to static export.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Worker + proxy RPC is the one genuinely novel piece | Isolate in `db/worker.ts` + `db/rpc.ts`; single smoke test |
| Interactive transactions lose read→write atomicity | Single-tab single-writer makes the gap narrow; optional mutation lock as the documented ceiling |
| Data loss (single browser store) | CSV export ships as carry-over + backup; `persist()`; `.sqlite` export as secondary |
| WASM bundle (~1MB) first load | Cached by the service worker after first visit |
| Loss of SSR → visible load state | Acceptable for a personal single-device app; keep worker boot fast |
| async ripple touches every `queries.ts` fn | Mechanical for reads; the transaction sites above are the only non-mechanical cases, all enumerated |

## Open questions (resolve during planning)

- Client data-refresh mechanism: per-feature `use-*` hook that owns reload (lean — matches the
  "custom hooks are first-class" convention) vs. one shared store.
- Whether to add the in-flight-mutation lock in Plan 1 or defer until an interactive-transaction
  race actually shows. Lean: defer, document the ceiling.
- Keep the commander CLI as a dev-only tool on the Node shim, or delete it. Lean: keep (cheap).
- Service-worker/manifest: hand-rolled minimal vs. a helper. Lean: minimal hand-rolled (YAGNI).

## Superseded

The original `.sqlite`-blob-first backup framing (superseded by the shipped CSV seam) and the
uncommitted Docker files from the prior self-host line of work (a client-side PWA has no server
to containerize — decide delete vs. keep-as-fallback separately).
