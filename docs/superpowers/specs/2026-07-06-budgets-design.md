# Feature D — Budgets (standing, set + track)

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation plan
**Feature area:** `src/features/budgets/` (new)

## Purpose

Let the user set standing monthly spending limits — one total and/or one per category — and see
how the current billing cycle's spend is pacing against them. This is the budget-vs-pace view
explicitly deferred from Slice 1 (import + cycle dashboard): that slice only shipped a calendar
"Day X of Y" meter, with no comparison to a limit.

## Dependencies (assumed to already exist)

Budgets is built on top of the `entries` feature shipped in Slice 1
(`docs/superpowers/plans/2026-07-06-import-and-cycle-dashboard.md`). This design assumes that
feature's public interface is available:

- `entries/queries.ts` — `getCycleSummary(db, start, end)`, `getCategoryBreakdown(db, start, end): Breakdown[]`
  (spending totals are **negative**), `getDistinctCategories(db): string[]`, and
  `type Breakdown = { key: string; total: number }`.
- `entries/cycle.ts` — `cycleFromKey`, `currentCycleKey`, `cycleProgress(cycle, todayIso): { day, total }`,
  `type Cycle`.
- `@shared/date` — `todayIso()`.
- `@shared/money` — `formatBaht`.

Tasks 1–4 below (schema, queries, pure budget math, actions) have no runtime dependency on these
and can be built in isolation. Tasks 5–7 (the `/budgets` page and dashboard wiring) need
`getDistinctCategories`, `getCategoryBreakdown`, `getCycleSummary`, and `cycle.ts` to exist.

## Scope

**In scope**

- New feature `src/features/budgets/`: standing budgets table (one row per category, plus one
  row with `category IS NULL` for the whole-cycle total).
- Set / read / delete budgets via a small query API.
- Pure budget-vs-spend math: per-category rows and a total row, each carrying a pace flag
  (spend % ahead of the cycle's calendar-progress %).
- A `/budgets` page (Server Component + Server Actions) to set and remove budgets.
- A `BudgetTracker` dashboard section wired under `SummaryBar` on `/dashboard`.

**Out of scope (later slices)**

- Per-cycle budget overrides (a different limit for a specific month).
- Rollover (unspent budget carrying into the next cycle).
- Alerts / notifications when a budget is breached.
- Budgeting by account (only by category + total).

## Feature-based placement

All work lives inside a new `budgets` feature. It reads types from `entries` structurally
(see "Cross-feature dependency" below) rather than importing `entries` modules, so the
`features → shared/db` dependency arrow stays clean and `budgets` doesn't create a hard runtime
dependency on `entries`'s internals.

```
src/
├── app/
│   ├── budgets/page.tsx          # (new) set/remove budgets — Server Component + Server Actions
│   └── dashboard/page.tsx        # (edit) render BudgetTracker under SummaryBar
├── features/
│   ├── entries/                  # untouched (Slice 1) — consumed via its public query API
│   └── budgets/                  # (new)
│       ├── schema.ts             # budgets table + ensureBudgetsTable
│       ├── schema.test.ts
│       ├── queries.ts            # getBudgets / setBudget / deleteBudget
│       ├── queries.test.ts
│       ├── budget.ts             # pure: toBudgetRows / totalBudgetRow
│       ├── budget.test.ts
│       ├── actions.ts            # 'use server' — setBudgetAction / deleteBudgetAction
│       └── ui/
│           └── BudgetTracker.tsx # dashboard section: per-category + total progress bars
└── shared/                       # untouched
```

## Schema

Standing budgets — **no cycle column**. The same limit applies to every billing cycle; per-cycle
overrides are deferred. Amounts are positive monthly limits (never signed — spend is compared as
a magnitude).

```
budgets {
  id       INTEGER PRIMARY KEY AUTOINCREMENT
  category TEXT              -- NULLable; NULL row = the TOTAL (whole-cycle) budget
  amount   REAL NOT NULL      -- positive monthly limit
}
```

`ensureBudgetsTable(db)` bootstraps with matching `CREATE TABLE IF NOT EXISTS` DDL, following the
same scaffold convention as `entries` (drizzle table is the source of truth; DDL is kept in sync
by hand until the schema stops being trivial, then migrations take over). Exports `Budget` /
`NewBudget` inferred types.

There is deliberately **no unique index** on `category`. SQLite's `UNIQUE` treats every `NULL` as
distinct from every other `NULL`, so a `UNIQUE(category)` index could never reliably de-duplicate
the total row via `INSERT ... ON CONFLICT`. Upsert is done explicitly instead (delete-then-insert,
see Queries).

## Queries

```ts
getBudgets(db): Budget[]
setBudget(db, category: string | null, amount: number): void
deleteBudget(db, category: string | null): void
```

`setBudget` upserts: delete the row matching that category, then insert. The `category === null`
(total) case is handled explicitly with drizzle's `isNull(budgets.category)` — **never**
`eq(budgets.category, null)`, which compiles to a SQL comparison against `NULL` that is always
false (`NULL = NULL` is unknown, not true) and would silently fail to delete the existing total
row, leaving a duplicate on every save. `deleteBudget` mirrors the same `isNull`/`eq` branch.

## Pure budget math (`budget.ts`)

Kept dependency-free of `entries` by taking a structurally-compatible local type instead of
importing `entries`'s `Breakdown`:

```ts
// Structurally compatible with @features/entries/queries' Breakdown ({ key, total }). Declared
// locally instead of imported so budgets has no compile-time dependency on the entries feature —
// callers passing entries' Breakdown[] type-check anyway (structural typing).
type SpentRow = { key: string; total: number }
```

```ts
type BudgetRow = { category: string; budget: number; spent: number; pct: number; overPace: boolean }

toBudgetRows(spent: SpentRow[], budgets: Budget[], progressPct: number): BudgetRow[]
```

For each budget row with a non-null category: sum the magnitudes (`Math.abs`) of every `SpentRow`
whose `key` matches that category (breakdown totals arrive negative — spending); `pct = budget ===
0 ? 0 : (spent / budget) * 100`; `overPace = pct > progressPct`. Sorted by `pct` descending
(worst-pacing category first). A budget with no matching spend this cycle shows `spent: 0`.
Categories with spend but **no** budget are simply absent from the result — only budgeted
categories get a row (no "unbudgeted" aggregate; keeping this simple was an explicit design call).
The null-category (total) budget row is excluded from this list — it has its own function below.

```ts
type TotalRow = { budget: number; spent: number; pct: number; overPace: boolean }

totalBudgetRow(totalSpent: number, budgets: Budget[], progressPct: number): TotalRow | null
```

Finds the `category === null` budget row; `totalSpent` is supplied by the caller (the cycle's
`Math.abs(summary.outflow)`) rather than computed here, keeping this function pure with no query
dependency. Returns `null` when no total budget has been set (renders nothing / an empty state).

## Actions (`actions.ts`, `'use server'`)

```ts
setBudgetAction(formData: FormData): Promise<void>
deleteBudgetAction(formData: FormData): Promise<void>
```

Both read a `category` field (empty string → `null`, meaning "the total") and, for `setBudgetAction`,
an `amount` field parsed as a number and guarded against `NaN` / negative values (a bad submission
is silently dropped rather than throwing — this is a personal single-user tool with no client-side
validation yet). Each calls `initDb()` → `ensureBudgetsTable(db)` → the matching query → 
`revalidatePath('/budgets')` and `revalidatePath('/dashboard')` (a budget changes what both pages
render).

## UI

- **`src/app/budgets/page.tsx`** — Server Component. A "Total" section with one form (hidden
  `category=""`, an amount input prefilled from the existing total budget if any, a Save button)
  plus a Remove button when a total is set. A "By category" list — one row per
  `getDistinctCategories(db)` result, each with the same set/remove form pair, prefilled from
  `getBudgets(db)` when a budget already exists for that category.
- **`src/features/budgets/ui/BudgetTracker.tsx`** — dashboard section, `{ rows: BudgetRow[], total:
  TotalRow | null }`. One progress bar per category row plus a total bar, each showing
  `formatBaht(spent) / formatBaht(budget)` and the rounded pct. Bar color is `var(--color-loss)`
  when `overPace`, else `var(--color-accent)` (mirrors the accent/loss convention already used by
  `Breakdown.tsx` and the app's semantic color tokens). Empty state (no budgets at all) renders a
  short message linking to `/budgets`.
- **Dashboard wiring** (`src/app/dashboard/page.tsx`) — inside the existing `summary.count > 0`
  branch, directly under `<SummaryBar>`:
  ```ts
  const progress = cycleProgress(cycle, todayIso());
  const progressPct = (progress.day / progress.total) * 100;
  const budgetRows = toBudgetRows(categoryBreakdown, getBudgets(db), progressPct);
  const total = totalBudgetRow(Math.abs(summary.outflow), getBudgets(db), progressPct);
  ```
  `categoryBreakdown` is hoisted to a local so it's computed once and shared between
  `<Breakdown title="By category" ... />` and `toBudgetRows` (previously `getCategoryBreakdown`
  was called inline only inside the JSX).

## Testing / verification

- `schema.test.ts`: `ensureBudgetsTable` produces a table that accepts both a category row and a
  `category: null` (total) row side by side.
- `queries.test.ts`: set/get a category budget; set/get the total under `category: null`; upsert
  overwrites an existing category budget rather than duplicating it; upsert on the total overwrites
  the total without touching category budgets; delete a category budget; delete the total via
  `null` without touching other budgets.
- `budget.test.ts` (`toBudgetRows`): spend under budget, spend over budget, `overPace` true only
  when `pct > progressPct`, a budgeted category with zero spend shows `spent: 0`, a zero-amount
  budget doesn't divide by zero, spend in an unbudgeted category is ignored, the total
  (null-category) row is excluded from the per-category list, sort order is pct-descending.
  `totalBudgetRow`: present when a total budget exists, `null` when it doesn't.
- End-to-end sanity: set a total and a couple of category budgets on `/budgets`, reload
  `/dashboard`, confirm the `BudgetTracker` bars show the right spend/limit/pct and the loss color
  kicks in once pace exceeds the cycle-progress meter's percentage.
- Gates before commit (per CLAUDE.md): `format:files` changed files → `typecheck` → `lint` →
  `format:check` → `test`.

## Open questions

None outstanding. Decisions locked:
- Budgets are standing (no cycle column); per-cycle overrides deferred.
- The total budget is modeled as a `category IS NULL` row in the same table, not a separate
  column or table — one query API, one upsert path, `isNull` handles the special case.
- Categories with spend but no budget are silently excluded from the tracker (no "unbudgeted"
  catch-all row) — keeping v1 simple.
- `overPace` compares spend-pct to the cycle's calendar-progress-pct (not a fixed threshold like
  50%), so a fast-approaching cycle end is judged fairly against how much of the cycle has
  actually elapsed.
