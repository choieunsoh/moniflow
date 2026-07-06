# Slice 1 — Monefy Import + Billing-Cycle Dashboard

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation plan
**Feature area:** `src/features/entries/`

## Purpose

Turn 10+ years of dead Monefy CSV export into a queryable ledger, then view it through
the user's real credit-card billing cycle (18th → 17th of next month). Read-first and
low-risk: no write path yet. This is the foundation slice — the add-entry form and budgets
build on top of it in later slices.

## Scope

**In scope**
- One-time CSV importer (CLI command) for the Monefy export.
- Two nullable schema columns so non-THB rows are not lossy.
- Pure billing-cycle math (18→17, start-month anchored, month-range label).
- Cycle-scoped read queries (summary, category breakdown, account breakdown).
- Dashboard page reads a selected cycle via URL param and renders the above.

**Out of scope (later slices)**
- Add/edit entry form (the write path).
- Budgets (set + track per-category and total).
- Category merge / alias cleanup tool.
- Trip / JPY spend view.
- Per-card cutoff days (this slice uses one global cutoff).
- Auto FX lookup (conversion is manual / already-present in the export).

## Feature-based placement

All Slice 1 work lives inside the `entries` feature. Nothing new enters `shared/` or `db/`;
the dependency arrow stays `features → shared/db`, never back.

```
src/
├── app/dashboard/page.tsx        # (edit) thin route → delegates to entries queries + cycle
├── db/client.ts                  # untouched — connection only, no feature imports
├── features/entries/
│   ├── schema.ts                 # (edit) + currency, original_amount columns
│   ├── import.ts                 # (new) Monefy CSV text → NewEntry[]  — pure
│   ├── import.test.ts            # (new)
│   ├── cycle.ts                  # (new) 18→17 billing-cycle math — pure
│   ├── cycle.test.ts             # (new)
│   ├── queries.ts                # (edit) + cycle-scoped reads
│   └── ui/                       # (edit) reuse SummaryBar + a breakdown view
├── shared/                       # untouched — date.ts, money.ts stay feature-agnostic
└── cli.ts                        # (edit) wire `import` command at the composition root
```

## Schema change

Extend the existing `entries` table (currently `id, date, account, category, amount, note`)
with two nullable columns. `amount` stays signed THB (the export's *converted* column) and
remains the basis for every rollup — currency stays purely informational this slice.

```
currency         TEXT   -- e.g. 'THB', 'JPY', 'HKD' (original currency of the entry)
original_amount  REAL   -- signed amount in the original currency
```

Rate is derivable (`amount / original_amount`) so it is not stored. Update both
`schema.ts` (drizzle table + `ensureEntriesTable` DDL) so the bootstrap `CREATE TABLE`
matches the drizzle definition.

## Importer (`import.ts` + CLI)

Monefy export columns, in order:
`date, account, category, amount, currency, converted_amount, currency2, description`

**Parsing**
- Fields: a small quoted-field CSV splitter (handles the `"12,000"` thousands-comma case).
  Hand-rolled + unit-tested against real rows; fall back to a tiny zero-dep CSV lib only if
  edge cases multiply.
- `date`: `DD/MM/YYYY` → `YYYY-MM-DD` by parsing the numeric parts into `Date.UTC(y, m-1, d)`
  and formatting with `Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })` — no string surgery.
- `amount` (THB): strip quotes + thousands commas from the **converted_amount** column → number,
  sign preserved (− outflow, + inflow).
- `currency` / `original_amount`: from the original `currency` + `amount` columns. For THB rows
  the original and converted values are equal.
- `note`: `description`, nullable (empty → null).

**Skip rule**
Drop rows that are transfers / balances, not real flow:
- `category === 'บัตรเครดิท'` (credit-card payment), and
- `category` starts with `Initial balance`.

Implemented as a small skip predicate. **During TDD, first enumerate every positive-amount
category in the real file** to confirm the list is complete (there may be other top-up /
transfer categories worth adding — e.g. cash / JPY top-ups); finalize the predicate against
that enumeration rather than guessing.

**Idempotency**
Truncate `entries`, then insert the parsed rows.
`// ponytail: safe because there is no write path yet. When the add-entry slice lands, switch`
`// to delete-where-source='monefy' (add a source column then) so hand-entered rows survive.`

**CLI**
`npm run dev -- import ./data/Monefy.Data.05-07-2026.csv`
Wires at the composition root (`cli.ts`): `initDb` → `import.ts` → `addEntries`. Prints
`imported N, skipped M` counts.

## Cycle math (`cycle.ts`) — pure, no DB

- `cycleOf(isoDate, cutoffDay = 18)` → `{ key, start, end, label }`
  - Day ≥ `cutoffDay` → cycle starts the `cutoffDay`th of this month.
  - Day < `cutoffDay` → cycle started the `cutoffDay`th of the **previous** month.
  - `start` = that 18th (`YYYY-MM-DD`), `end` = the following 17th (`YYYY-MM-DD`).
  - `key` = start month `YYYY-MM` (start-month anchored) → used in URL `?cycle=`.
  - `label` = month range:
    - same year: `18 Jul – 17 Aug 2026`
    - crosses year: `18 Dec 2026 – 17 Jan 2027`
    - built via `Intl` month/day formatting (reuse/extend `shared/date.ts`), never string surgery.
- `currentCycle(today)` → the cycle containing today.
- `listCycles(minIso, maxIso)` → cycles spanning the data range, for the picker (walk `YYYY-MM`).
- `cutoffDay` is a config constant (default 18) — **one global cutoff**; per-card cutoffs deferred.

**Tests:** 17th vs 18th boundary, Dec→Jan year rollover, `currentCycle` selection,
`listCycles` endpoints, label formatting for same-year and cross-year cycles.

## Cycle-scoped queries (`queries.ts`)

New reads, each filtering by an inclusive date range `[start, end]` using SQL `WHERE` +
`GROUP BY` (drizzle) rather than a JS reduce over the whole table:

- `getCycleSummary(db, start, end)` → `{ net, inflow, outflow, count }`.
- `getCategoryBreakdown(db, start, end)` → `[{ category, total }]`, sorted by magnitude.
- `getAccountBreakdown(db, start, end)` → `[{ account, total }]`.

Existing whole-table `getSummary` / `getNetFlow` stay as-is (out of scope to refactor unless
a cycle view needs them).

## Dashboard (`app/dashboard/page.tsx`)

Server component, URL-param driven (no client JS — matches the scaffold pattern):

- Reads `?cycle=<YYYY-MM>`; defaults to `currentCycle(today)`.
- Resolves the cycle range via `cycle.ts`, calls the cycle-scoped queries.
- Renders:
  - **Cycle selector** — prev / current / next as `<a href="?cycle=…">` links, showing the
    range label.
  - **SummaryBar** (reuse existing) scoped to the cycle; spending is the headline figure.
  - **Category breakdown** — bars/list of `getCategoryBreakdown`.
  - **Account breakdown** — `getAccountBreakdown`.
  - **Cycle-progress meter** — "Day 12 of 31" (calendar progress only). Full budget-vs-pace
    comparison waits for the budgets slice.
- Reuses existing UI (`SummaryBar`, `FlowChart`, `LedgerTable`, `EmptyLedger`); any new
  chart follows the scaffold rule — a pure, tested option-builder + a thin React wrapper.

## Testing / verification

- `import.test.ts`: quoted-comma amount, `DD/MM/YYYY` date, JPY row (original vs converted),
  sign preservation, skip rule.
- `cycle.test.ts`: boundaries, year rollover, current-cycle, list, labels.
- Query tests: round-trip a handful of rows, assert range filtering + grouping.
- End-to-end sanity: run `import` against the real export, load `/dashboard`, confirm the
  current cycle shows sensible totals.
- Gates before commit (per CLAUDE.md): `format:files` changed files → `typecheck` → `lint` →
  `format:check` → `test`.

## Open questions

None outstanding. Decisions locked:
- First slice = import + cycle dashboard.
- FX = manual / already-converted; no API.
- Non-expense positive rows (card payments, initial balances) = **skipped** on import.
- Cycle = one global 18→17 cutoff, start-month `YYYY-MM` key, month-**range** label.
