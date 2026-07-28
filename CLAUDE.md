# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moniflow is a personal, offline-first, **mobile-first spending tracker**. It stores signed financial
entries in a **SQLite database that lives in the browser** (OPFS, via SQLite WASM) and presents them
through a small **Next.js** web app shaped as a phone-sized column with a bottom tab bar. Single user,
no cloud, no server. Data is hand-entered (a Monefy-style keypad) or bulk-imported from a **Monefy
CSV** (THB home currency). It is scoped to a monthly **billing cycle** (a configurable cutoff day).
It is a **spending tracker**: the ledger holds outflows only — income (inflows, `amount >= 0`) is
dropped at CSV import (`parseMonefyCsv`) and the keypad only enters expenses — and every UI read
surface shows expenses (`amount < 0`), enforced in the queries (`getEntriesInRange`,
`getCategoryBreakdown`, `searchEntries`). The `amount` column stays signed (schema-level), but in
practice every stored row is negative.
Scaffolded from the `portfolio-dashboard` stack.

- **Stack — data layer:** Node 24 (nvm) · TypeScript 5.9 strict (ESM; `module: esnext` +
  `moduleResolution: bundler`, extensionless relative imports) · `@sqlite.org/sqlite-wasm` (the
  shipping engine, in a worker over OPFS) · better-sqlite3 (**tests only**) · drizzle-orm
  (storage/ORM) · Vitest.
- **Stack — web layer:** Next.js 16 App Router, **`output: 'export'`** · React 19 · Tailwind CSS v4 ·
  ECharts 6 · Phosphor / Lucide (switchable category icon sets). **There is no server.** Every page is
  `'use client'` and loads its own data after mount through a `use-*.ts` hook against the browser db;
  writes go through the feature's `actions.ts` — plain async functions, **not** Server Actions — which
  call `bumpDataVersion()` so every live read-hook refetches. Interactivity (cycle, filters, search,
  view) rides on **URL search params**, read via `useSearchParams`.

**The browser is the system of record.** Nothing server-side reads or writes the ledger, and no
`.db` file on disk is live: `data/moniflow.db` is an orphaned pre-migration snapshot. To get data in
or out, use Settings → Backup (Monefy CSV export/restore). OPFS is scoped **per origin**, so dev
(`127.0.0.1:4010`) and any deployed host hold separate ledgers — and `localhost:4010` is a _different_
origin from `127.0.0.1:4010`, with its own database.

## Commands

```bash
npm run dev:web         # Next.js dev server (127.0.0.1:4010, Turbopack)
npm run build:web       # next build → static out/, servable by any static host
npm run typecheck       # tsc --noEmit (strict)
npm run lint            # eslint . (flat config, type-aware)
npm run format          # prettier --write .
npm test                # vitest run
npm test -- <file>      # single test file
```

Before committing, **format the files you changed, then run the check gates separately** so
failures surface individually:

```bash
npm run format:files <changed files>   # prettier --write on what you touched
npm run typecheck
npm run lint
npm run format:check                    # backstop — verifies nothing is left unformatted
npm test
```

All must pass before committing.

## Toolchain notes (inherited from portfolio-dashboard — keep these)

- **ESLint 10 flat config + Prettier 3:** `eslint.config.mjs` deliberately does **NOT** use
  `eslint-config-next` — its bundled Babel parser and `eslint-plugin-react` crash under ESLint 10.
  Next rules come from `@next/eslint-plugin-next` directly + `eslint-plugin-react-hooks` v7. The
  global CLAUDE.md TS bans (no `any`/`as`/`!`/ts-comments, `type` over `interface`) are enforced
  as **errors**; `as const` stays allowed. Prettier owns formatting (single quotes, 100 cols,
  Tailwind class sorting).
- **The SQLite WASM assets are copied, not bundled** — `scripts/copy-sqlite3.mjs` mirrors the
  sqlite-wasm dist into `public/sqlite3/` and runs from `predev:web` / `prebuild:web`. The worker
  fetches them at runtime, so they must exist before either command.
- **Schema lives in TWO places and they must stay in lockstep.** Each feature's `schema.ts` is its
  drizzle table + `ensure<Table>Table(db)` (used by the Node shim in tests), but the shipping
  bootstrap is `BOOTSTRAP_SQL` in `src/db/worker.ts` — the eight-table DDL is duplicated there so `db/`
  imports no feature (see the dependency rule). **A new column or table means editing both.**
  `src/db/schema-lockstep.test.ts` is what catches a drift: it bootstraps one db each way and diffs
  sqlite's own `PRAGMA` output, so a new table is covered automatically — but add it to that test's
  `TABLES` list, or the two definitions are only compared for the tables already named there.
- **`drizzle-kit` is effectively vestigial.** `drizzle.config.ts` has no `dbCredentials` and there is
  no `drizzle/migrations` output — there is no reachable database for it to touch, since the only
  live one is in a browser. Schema changes go through `schema.ts` + `worker.ts` (above), not a
  migration.

## Architecture — feature-based

Organize by **domain, not technical layer**. A feature owns its schema, queries, hooks, and
components; `db/` and `shared/` hold only cross-cutting infrastructure.

```
src/
├── app/                    # Next 16 App Router — thin 'use client' routes that delegate to features
│   ├── layout.tsx          # the 412px phone-frame shell (.app-frame) + AppHeader + BottomBar
│   ├── globals.css         # Tailwind v4 @theme tokens + component classes
│   ├── manifest.ts         # PWA manifest (icons + public/sw.js make it installable)
│   ├── page.tsx            # / — cycle spending donut + category breakdown (chart/list)
│   ├── records/, budgets/, categories/, accounts/, trips/, settings/  # routes
│   └── entries/{new,edit}/ # edit is ?id=-parameterised — a static export can't prerender [id]
├── db/                     # the sqlite-proxy seam: features never touch a concrete engine
│   ├── client.ts           # (@db) the public `Db` type + makeNodeProxyDb re-export
│   ├── browser.ts          # getBrowserDb() — THE shipping backend (worker + OPFS), memoized
│   ├── worker.ts           # the WASM/OPFS worker + BOOTSTRAP_SQL (the eight-table DDL)
│   ├── rpc.ts              # DbWorkerRpc — request/response plumbing to the worker
│   └── node-proxy.ts       # in-memory better-sqlite3 backend — TESTS ONLY, never ships
├── features/               # organised by domain; each owns schema + queries + actions + ui
│   ├── entries/            # the ledger: entries table, cycle math, donut/breakdown, records, keypad
│   ├── budgets/            # standing per-category monthly limits
│   ├── categories/         # category display meta (emoji + hue) and the icon-set system
│   ├── accounts/           # accounts + their icon/hue/order
│   ├── currencies/         # the currency catalog: codes, per-currency off-budget flag, /currency page
│   └── settings/           # key-value store: billing cutoff day, icon set, font scale, card FX fee
└── shared/
    ├── ui/                 # cross-feature shell: PageContainer, AppHeader, BottomBar, MoreSheet…
    ├── data-version.ts     # bumpDataVersion()/useDataVersion() — the write→refetch signal
    └── money.ts, date.ts   # (@shared) THB Intl formatter, Bangkok-tz date helpers
```

Each feature's `schema.ts` is its drizzle table + `ensure<Table>Table(db)` bootstrap; `queries.ts`
holds typed reads/writes; `actions.ts` the client-side write functions (each ending in
`bumpDataVersion()`); `use-*.ts` the read hooks; pure logic (cycle, donut, breakdown, calc, trips,
combobox…) sits in plain modules with co-located `*.test.ts`.

Path aliases: `@db/*`, `@features/*`, `@shared/*` (see `tsconfig.json`).

**Both db backends are sqlite-proxy drivers**, so a feature depends only on the `Db` type, never on
an engine. That is what lets tests run the SAME async driver and row shaping the browser worker runs.
Row shaping must stay identical across the two: sqlite-proxy maps rows **positionally**, so each row
comes back as an ARRAY of column values, not an object.

**Dependency rule:** the arrow points **features → db/shared**, never back. `db/` must not import any
feature (that's why it dropped drizzle's schema generic — we use the query builder, not the
`db.query.*` relational API — and why `worker.ts` duplicates the DDL). Features may use `@shared/*`;
shared code stays feature-agnostic. Cross-feature reuse graduates a module from `features/x/` to
`shared/`.

**Reads are async and post-mount.** There is no server render, so a page's first paint is a loading
state; every read hook returns `{ ready, data }` and the route renders a `…` placeholder until
`ready`. Don't reintroduce a synchronous read — there isn't one to reintroduce.

**Custom hooks are first-class.** Stateful/business logic in client components belongs in named
custom hooks at `src/features/<domain>/use-*.ts` (kebab-case), each with a `renderHook` test —
not inline. Do this by default.

## Development Workflow

- **TDD.** Failing-test-first → implement → verify green → commit. Charts = pure, tested
  option-builders + thin React wrappers.
- **Verify in a browser.** Tests run against the Node shim, so they prove the queries and never the
  worker, OPFS, or layout. A UI or data-layer change isn't done until it's been driven at 412px.
- **Commit per topic.** Scopes: `db`, `app`, `features`, `shared`. _(Commit format + branching rules
  live in the global CLAUDE.md.)_

## Code Style

- Money is `฿`/THB; user-facing dates render in **Bangkok** tz. DB date keys use
  `Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })` → `YYYY-MM-DD` (UTC, stable across zones).
- **Pick the money formatter by provenance:** `formatBaht` for any figure the app computed or stored
  (states satang — `฿228.00`), `formatBahtKeyed` ONLY for echoing a figure the user is typing (`฿123`
  stays `฿123`), `formatBahtWhole` for glance figures that would rather be short than exact.
- Typed reads use the drizzle query builder (column selections infer the row type — no `as`).
- _General TS/style rules — no `any`/`as`/`!`, `for..of`, `satisfies`+`as const`, `type` over
  `interface`, `Intl` formatting — live in the global CLAUDE.md._

## Environment

- **Private financial data:** `data/` is git-ignored — never commit it. Nothing reads it any more
  (see "the browser is the system of record"); it holds a pre-OPFS snapshot and the source Monefy CSV.
- **No auth.** The basic-auth gate went with `src/middleware.ts` when the app became a static export —
  a static bundle has no server to enforce it. Anything served publicly is public; the data itself
  never leaves the visitor's own browser.
