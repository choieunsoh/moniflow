# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moniflow is a personal, **local-first money-flow dashboard**. It stores financial entries
(inflows/outflows) in a local **SQLite** database and presents them through a small **Next.js**
web app. Single user, read-only over ingested data. Scaffolded from the `portfolio-dashboard`
stack.

- **Stack — data layer:** Node 24 (nvm) · TypeScript 5.9 strict (ESM; `module: esnext` +
  `moduleResolution: bundler`, extensionless relative imports) · tsx · better-sqlite3 +
  drizzle-orm (storage/ORM) · drizzle-kit (migrations) · commander (CLI) · Vitest.
- **Stack — web layer:** Next.js 16 App Router · React 19 · Tailwind CSS v4 · ECharts 5.
  Server Components read SQLite **directly** via the query module — no API layer. Interactivity
  (scope, selection, sort) rides on **URL search params** that re-render the server component.

## Commands

```bash
npm run dev             # commander CLI entrypoint (tsx src/cli.ts) — e.g. `npm run dev -- summary`
npm run dev:web         # Next.js dev server (127.0.0.1:4001, Turbopack)
npm run build:web       # next build — production web build
npm run typecheck       # tsc --noEmit (strict)
npm run lint            # eslint . (flat config, type-aware)
npm run format          # prettier --write .
npm test                # vitest run
npm test -- <file>      # single test file
npm run db:generate     # drizzle-kit generate — migration from schema.ts (once schema is non-trivial)
npm run db:push         # drizzle-kit push — apply schema to a DB without a migration (dev only)
```

Run quality gates **separately** (`npm run typecheck`, `npm run lint`, then `npm test`) so
failures surface individually. All three must pass before committing.

## Toolchain notes (inherited from portfolio-dashboard — keep these)

- **ESLint 10 flat config + Prettier 3:** `eslint.config.mjs` deliberately does **NOT** use
  `eslint-config-next` — its bundled Babel parser and `eslint-plugin-react` crash under ESLint 10.
  Next rules come from `@next/eslint-plugin-next` directly + `eslint-plugin-react-hooks` v7. The
  global CLAUDE.md TS bans (no `any`/`as`/`!`/ts-comments, `type` over `interface`) are enforced
  as **errors**; `as const` stays allowed. Prettier owns formatting (single quotes, 100 cols,
  Tailwind class sorting).
- **better-sqlite3 is a native addon** — `next.config.ts` lists it in `serverExternalPackages`
  so Next never bundles it for the server.
- **Schema is drizzle-first:** each feature's `schema.ts` (e.g. `src/features/entries/schema.ts`)
  is that feature's source of truth; `drizzle.config.ts` globs them via `./src/features/*/schema.ts`.
  The scaffold's `ensureEntriesTable` bootstraps with `CREATE TABLE IF NOT EXISTS`; once a schema
  stops being trivial, switch to committed migrations (`npm run db:generate` → replay at the
  composition root via drizzle `migrate()`).

## Architecture — feature-based

Organize by **domain, not technical layer**. A feature owns its schema, queries, hooks, and
components; `db/` and `shared/` hold only cross-cutting infrastructure.

```
src/
├── app/                    # Next 16 App Router — thin routes that delegate to features
│   └── layout.tsx, page.tsx, globals.css   # Tailwind v4 @theme tokens
├── db/
│   └── client.ts           # (@db) initDb(path): the SQLite connection ONLY — schema-agnostic
├── features/
│   └── entries/            # (@features/entries) the money-flow domain
│       ├── schema.ts        # drizzle table + Insert/Select types + ensureEntriesTable(db)
│       ├── queries.ts       # typed reads/writes (addEntries / getEntries / getNetFlow)
│       └── entries.test.ts  # feature-level round-trip test
├── shared/
│   └── money.ts            # (@shared) cross-feature THB Intl formatter
└── cli.ts                  # commander composition root — wires initDb → feature modules
```

Path aliases: `@db/*`, `@features/*`, `@shared/*` (see `tsconfig.json`).

**Dependency rule:** the arrow points **features → db/shared**, never back. `db/client.ts` must
not import any feature (that's why it dropped drizzle's schema generic — we use the query builder,
not the `db.query.*` relational API). Features may use `@shared/*`; shared code stays
feature-agnostic. Cross-feature reuse graduates a module from `features/x/` to `shared/`.

**Custom hooks are first-class.** Stateful/business logic in client components belongs in named
custom hooks at `src/features/<domain>/use-*.ts` (kebab-case), each with a `renderHook` test —
not inline. Do this by default.

## Development Workflow

- **TDD.** Failing-test-first → implement → verify green → commit. Charts = pure, tested
  option-builders + thin React wrappers.
- **Commit per topic.** Scopes: `db`, `app`, `cli`, `features`, `shared`. _(Commit format +
  branching rules live in the global CLAUDE.md.)_

## Code Style

- Money is `฿`/THB; user-facing dates render in **Bangkok** tz. DB date keys use
  `Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })` → `YYYY-MM-DD` (UTC, stable across zones).
- Typed reads use the drizzle query builder (column selections infer the row type — no `as`).
- _General TS/style rules — no `any`/`as`/`!`, `for..of`, `satisfies`+`as const`, `type` over
  `interface`, `Intl` formatting — live in the global CLAUDE.md._

## Environment

- **Private financial data:** `data/` (source + built `moniflow.db*` incl. `-wal`/`-shm`) is
  git-ignored — never commit it.
