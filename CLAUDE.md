# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moniflow is a personal, offline-first, **mobile-first spending tracker**. It stores signed financial
entries in a **SQLite database that lives in the browser** (OPFS, via SQLite WASM) and presents them
through a small **Next.js** web app shaped as a phone-sized column with a bottom tab bar. Single user,
no cloud, no server. Data is hand-entered (a Monefy-style keypad) or bulk-imported from a **Monefy
CSV** (THB home currency). It is scoped to a monthly **billing cycle** (a configurable cutoff day).
It is a **spending tracker with refunds**: the ledger is overwhelmingly outflows, but a positive
`amount` row records money handed back against spending that already happened (a friend repaying
their share while the card carried the whole bill). A refund is filed under the category it refunds
and every summed figure nets — consumers negate a stored amount rather than taking `Math.abs`, so an
expense adds and a refund subtracts. Standalone income (salary) is deliberately unmodellable: it
would drive its category net-positive and simply drop out of the donut. Bulk Monefy CSV import still
drops inflows (`parseMonefyCsv`, whose `keepInflows` flag exists for moniflow's own backup restore);
`hasAnyExpense` and `getFirstExpenseDate` still filter `amount < 0`.
Scaffolded from the `portfolio-dashboard` stack.

- **Stack — data layer:** Node 24 (nvm; pinned by `.nvmrc` + `engines`) · TypeScript 5.9 strict (ESM; `module: esnext` +
  `moduleResolution: bundler`, extensionless relative imports) · `@sqlite.org/sqlite-wasm` (the
  shipping engine, in a worker over OPFS) · better-sqlite3 (**tests only**) · drizzle-orm
  (storage/ORM) · Vitest.
- **Stack — web layer:** Next.js 16 App Router, **`output: 'export'`** · React 19 · Tailwind CSS v4 ·
  ECharts 6 · @dnd-kit (drag reorder) · Phosphor / Lucide (switchable category icon sets).
  **There is no server.** Every page is `'use client'` and loads its own data after mount through
  a `use-*.ts` hook against the browser db; writes go through the feature's `actions.ts` — plain
  async functions, **not** Server Actions — which call `bumpDataVersion()` so every live read-hook
  refetches. Interactivity (cycle, filters, search, view) rides on **URL search params**, read via
  `useSearchParams`.

**The browser is the system of record.** Nothing server-side reads or writes the ledger, and no
`.db` file on disk is live: `data/moniflow.db` is an orphaned pre-migration snapshot. To get data in
or out, use Settings → Backup (Monefy CSV export/restore). OPFS is scoped **per origin**, so dev
(`127.0.0.1:4010`) and any deployed host hold separate ledgers — and `localhost:4010` is a _different_
origin from `127.0.0.1:4010`, with its own database. OPFS also hands its access handle to **one
holder at a time**, so a second tab on the same origin cannot open the db at all. `useDbHealth`
(mounted once in `AppShell`, because the db is app-wide) turns that into the `DbUnavailable` panel,
which REPLACES the page rather than sitting above it — a blank-looking second tab during browser
verification is this, not a bug.

## Commands

```bash
npm run dev:web         # Next.js dev server (127.0.0.1:4010, Turbopack)
npm run build:web       # next build → static out/, servable by any static host
npm run typecheck       # tsc --noEmit (strict)
npm run lint            # eslint . (flat config, type-aware)
npm run format          # prettier --write .
npm test                # vitest run
npm test -- <file>      # single test file
npm run release <bump>  # gates → bump → CHANGELOG → tag → push → gh release → deploy to Vercel
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
- **Two artefacts are generated into `public/` before dev/build, and both are gitignored.**
  `scripts/copy-sqlite3.mjs` mirrors the sqlite-wasm dist into `public/sqlite3/` (the worker fetches
  it at runtime); `scripts/stamp-sw.ts` writes a version-stamped `public/sw.js` from
  `scripts/sw.template.js`. Both run from `predev:web` / `prebuild:web`. The stamp **must** stay
  pre-build: Vercel collects the static output _during_ `next build`, so a postbuild stamp works
  locally and silently never ships — that is how an installed PWA ran a bundle several releases old.
- **Schema lives in THREE places and they must stay in lockstep.** Each feature's `schema.ts` is its
  drizzle table + `ensure<Table>Table(db)` (used by the Node shim in tests); the shipping bootstrap is
  `BOOTSTRAP_SQL` in `src/db/worker.ts` — the eight-table DDL is duplicated there so `db/` imports no
  feature (see the dependency rule); and `src/db/column-migrations.ts` holds the append-only
  `ALTER TABLE` list. **A new table = `schema.ts` + `worker.ts`. A new column = those two PLUS a
  `COLUMN_MIGRATIONS` entry** — `CREATE TABLE IF NOT EXISTS` never alters an existing OPFS db, so a
  missing migration crashes every existing user on their next open.
  `src/db/schema-lockstep.test.ts` catches drift by bootstrapping one db each way and diffing sqlite's
  own `PRAGMA` output, so a new **column** is covered the day it lands. A new **table** is covered
  too, but through a hand-written list: the test reads `worker.ts` as TEXT and asserts its
  `CREATE TABLE` names equal its `TABLES` array exactly. A table added to `worker.ts` without a
  `TABLES` entry fails that assertion; one added to `TABLES` without a matching `featureDb()` line
  fails on an empty column fingerprint. Both are red — neither is silent.
- **`drizzle-kit` is effectively vestigial.** `drizzle.config.ts` has no `dbCredentials` and there is
  no `drizzle/migrations` output — there is no reachable database for it to touch, since the only
  live one is in a browser. Schema changes go through the three places above, not a
  migration.

## Architecture — feature-based

Organize by **domain, not technical layer**. A feature owns its schema, queries, hooks, and
components; `db/` and `shared/` hold only cross-cutting infrastructure.

```
src/
├── app/                    # Next 16 App Router — thin 'use client' routes that delegate to features
│   ├── layout.tsx          # next/font + the pre-paint no-FOUC script + <AppShell>
│   ├── globals.css         # Tailwind v4 @theme tokens (every colour ONE light-dark() pair) + components
│   ├── globals.test.ts     # parses globals.css and asserts every contrast ratio, in BOTH themes
│   ├── manifest.ts         # PWA manifest (icons + the generated public/sw.js make it installable)
│   ├── page.tsx            # / — cycle spending donut + category breakdown (chart/list)
│   ├── analytics/, month/, year/, report/, trips/          # the "over time" surfaces
│   ├── records/, budgets/, categories/, accounts/, currency/, settings/, about/
│   ├── entries/{new,edit}/ # edit is ?id=-parameterised — a static export can't prerender [id]
│   └── recurring/{,new,edit}/ # same ?id= shape, same reason
├── db/                     # the sqlite-proxy seam: features never touch a concrete engine
│   ├── client.ts           # (@db) the public `Db` type + makeNodeProxyDb re-export
│   ├── browser.ts          # getBrowserDb() — THE shipping backend (worker + OPFS), memoized
│   ├── worker.ts           # the WASM/OPFS worker + BOOTSTRAP_SQL (the eight-table DDL)
│   ├── rpc.ts              # DbWorkerRpc — request/response plumbing to the worker
│   ├── column-migrations.ts # append-only ALTER TABLE list — what BOOTSTRAP_SQL can't do to an old db
│   └── node-proxy.ts       # in-memory better-sqlite3 backend — TESTS ONLY, never ships
├── features/               # organised by domain; each owns schema + queries + actions + ui
│   ├── entries/            # the ledger: entries table, cycle math, donut/breakdown, records, keypad
│   ├── budgets/            # standing per-category monthly limits
│   ├── categories/         # category display meta (emoji + hue) and the icon-set system
│   ├── accounts/           # accounts + their icon/hue/order
│   ├── currencies/         # the currency catalog: codes, per-currency off-budget flag, /currency page
│   ├── recurring/          # self-posting rules (subs/bills/installments) + the app-open sweep
│   ├── drive/              # one-way Google Drive backup: GIS token flow, drive.file REST, sync-on-open
│   └── settings/           # key-value store: cutoff day, icon set, font scale, card FX fee, theme+accent
└── shared/
    ├── ui/                 # cross-feature shell: AppShell (the 412px .app-frame), PageContainer,
    │                       #   AppHeader, BottomBar, MoreSheet, ConfirmDialog, ToastRegion…
    ├── data-version.ts     # bumpDataVersion()/useDataVersion() — the write→refetch signal
    ├── db-effect.ts        # withDb() — THE wrapper every read hook's effect goes through
    ├── use-db-health.ts    # "can the db open at all?" — one check, app-wide, behind DbUnavailable
    ├── use-resolved-theme.ts # the light/dark a chart must be rebuilt against
    ├── backup-safety.ts    # OPFS persist request + the "last backed up N days ago" nudge
    ├── save-file.ts, reorder.ts
    └── money.ts, date.ts   # (@shared) THB Intl formatters, Bangkok-tz date helpers
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

**Dependency rule:** the arrow points **features → db/shared**, never back — but the two halves are
not equally strict. `db/` must not import any feature: that one is absolute (it's why `db/` dropped
drizzle's schema generic — we use the query builder, not the `db.query.*` relational API — and why
`worker.ts` duplicates the DDL), and it holds today with zero exceptions. `shared/` is the softer
half: it stays feature-agnostic apart from exactly TWO deliberate leaks — `shared/ui/AppShell.tsx`
is the composition root, so it imports seven feature modules by design (theme, font scale, search
suggestions, the recurring sweep, Drive sync, the category picker), and `shared/use-backup-status.ts`
asks `hasAnyExpense` whether there is anything worth nagging about yet. Don't grow that list without
a reason as good. Features may use `@shared/*` freely; cross-feature reuse graduates a module from
`features/x/` to `shared/`.

**Reads are async and post-mount.** There is no server render, so a page's first paint is a loading
state; every read hook returns `{ ready, data }` and the route renders a `…` placeholder until
`ready`. Don't reintroduce a synchronous read — there isn't one to reintroduce.
Every read hook runs its effect through **`withDb`** (`@shared/db-effect`), never a bare
`void (async () => { const db = await getBrowserDb(); … })()` — that shape turns ONE failed OPFS boot
into an unhandled rejection per mounted hook (seventeen of them, all describing what `useDbHealth`
already says once). `withDb` splits the two cases deliberately: **db won't open → resolve quietly**
(the shell owns that message), **effect throws → propagate** (a broken query stays as loud as it is
today). A blanket `.catch` would swallow both and strand the page on its skeleton forever. Writes in
`actions.ts` call `getBrowserDb()` directly — a failed write must be loud.

**Custom hooks are first-class.** Stateful/business logic in client components belongs in named
custom hooks at `src/features/<domain>/use-*.ts` (kebab-case), each with a `renderHook` test —
not inline. Do this by default.

## Development Workflow

- **TDD.** Failing-test-first → implement → verify green → commit. Charts = pure, tested
  option-builders + thin React wrappers.
- **Verify in a browser.** The suite runs under jsdom against the Node shim: ~115 `*.test.ts` prove
  the queries, hooks and pure logic, ~29 `*.test.tsx` (Testing Library) prove component render and
  interaction. None of them prove the WASM worker, OPFS, the service worker, or real layout. A UI or
  data-layer change isn't done until it's been driven in a real browser at 412px.
- **Commit per topic.** Scopes: `db`, `app`, `features`, `shared`. _(Commit format + branching rules
  live in the global CLAUDE.md.)_

## Code Style

- Money is `฿`/THB; user-facing dates render in **Bangkok** tz. DB date keys use
  `Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })` → `YYYY-MM-DD` (UTC, stable across zones).
- **Pick the money formatter by provenance:** `formatBaht` for any figure the app computed or stored
  (states satang — `฿228.00`), `formatBahtKeyed` ONLY for echoing a figure the user is typing (`฿123`
  stays `฿123`), `formatBahtWhole` for glance figures that would rather be short than exact.
- **Signed money has two more formatters, and they are not interchangeable:** `formatSignedBaht`
  always prints an explicit `+`/`−` (U+2212), for figures where direction is the point;
  `formatLedgerSpend` prints a _row_ — plain for an ordinary (negative) spend, signed only for the
  exceptional refund. A section total is a plain sum of stored amounts — the SAME frame as the rows
  it sums — so it takes the SAME formatter: hand `formatLedgerSpend` the total, never
  `formatSignedBaht(-total)`. Negating first is the opposite reading, and printed `−฿405` on a
  /records header directly above the `+฿405` refund row it summed. `money.test.ts` scans `src/**`
  for `formatSignedBaht(-` so the two frames cannot diverge again.
- **Theme is two independent axes, both driven by `color-scheme`:** `[data-theme]` (light/dark/OS)
  and `[data-accent]` (9 palettes, which redeclare only `--action`/`--on-action`/`--action-hover`).
  An accent is legal because it separates by LIGHTNESS (OKLCH L 86 dark / L 30 light) from the
  category band at L 62–66 — hue stays category identity. Every colour is declared ONCE as
  `light-dark(<light>, <dark>)`; no colour may have its only definition inside a media query or an
  attribute selector. `globals.test.ts` parses the stylesheet, checks the ratios in both themes, and
  greps `src/**` for `var(--<removed token>)` — deleting a custom property breaks nothing at build
  time.
  ECharts draws to a canvas and BAKES token values at render, so a chart option-builder needs the
  resolved theme as an explicit dependency (`useResolvedTheme`, in `@shared`) or it keeps the old
  palette. **`DESIGN.md` is the long form of this** — the full token table, both axes, the accent
  derivation, and the derived chart palette. It and `globals.css` must move together.
- Typed reads use the drizzle query builder (column selections infer the row type — no `as`).
- _General TS/style rules — no `any`/`as`/`!`, `for..of`, `satisfies`+`as const`, `type` over
  `interface`, `Intl` formatting — live in the global CLAUDE.md._

## Environment

- **Private financial data:** `data/` is git-ignored — never commit it. Nothing reads it any more
  (see "the browser is the system of record"); it holds a pre-OPFS snapshot and the source Monefy CSV.
- **No auth.** The basic-auth gate went with `src/middleware.ts` when the app became a static export —
  a static bundle has no server to enforce it. Anything served publicly is public; the data itself
  never leaves the visitor's own browser.
