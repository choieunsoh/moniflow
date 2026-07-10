# Budgets on the homepage — design

**Date:** 2026-07-10
**Status:** Approved, ready for planning

## Goal

Surface standing budgets on the homepage spending overview so the user sees budget
progress where they already look, without opening the Budgets page. Applies to both
homepage views: **Chart** (donut + legend) and **List** (ranked category bars).

## Core insight

This is **wiring, not new logic.** The budget model already exists as pure, tested code
in `src/features/budgets/budget-status.ts`:

- `toBudgetTotal(limit, spent)` → `{ limit, spent, pct, remaining, state }` for any
  `(limit, spent)` pair. `state` ∈ `over` | `near` | `under` | `none`.

Nothing new needs to be computed. One shared meter component, fed from data already
loaded on the page.

## Decisions (locked)

- **Surface:** budgets appear on **both** homepage views.
- **List view — unbudgeted categories:** keep the current plain bar (accent, sized
  relative to the biggest spender, no budget text). Only budgeted rows become meters.
- **Chart view — total budget:** a single meter bar **below the donut**, reusing the
  same meter component as the List rows. The donut hole is **unchanged** (spent + count).
- **State colors** (from existing tokens in `globals.css`):
  - `over` → `--color-loss` (red)
  - `near` → `--color-warn` (amber)
  - `under` → `--color-accent` (calm — deliberately no green; under-budget must not shout)
  - Unbudgeted and under-budget bars look the same; only `near`/`over` deviate.
- **Graceful degradation:** with no budgets set anywhere, the homepage looks exactly as
  it does today. Budget UI appears only where a limit exists.

## Components & data flow

### 1. New: `BudgetMeter.tsx` (`src/features/budgets/ui/`)

Pure presentational (~30 lines). Props: a status shape
(`limit`, `spent`, `pct`, `state`, `remaining`). Renders the colored progress bar plus a
right-aligned caption:

- caption when `over` → `over ฿600` (`formatBaht(Math.abs(remaining))`)
- caption otherwise → `74%` (`Math.round(pct)`)

Bar fill color comes from `meterColorVar(state)` (below). No client state — it renders
server-side inside the existing Server Component page.

`BudgetMeter` renders **only** the bar + caption. Each caller owns its own header/label
line above it: the List row keeps its icon + name + count + `฿spent / ฿limit`; the total
meter's caller renders a `Total budget  ฿spent / ฿limit` line. This keeps the shared
component tiny and lets the two layouts differ.

### 2. `budget-status.ts` — add `meterColorVar(state)`

One tiny pure helper mapping `BudgetState` → CSS var name:

| state   | var               |
| ------- | ----------------- |
| `over`  | `--color-loss`    |
| `near`  | `--color-warn`    |
| `under` | `--color-accent`  |
| `none`  | `--color-accent`  |

Extracted so the color mapping is unit-testable and `BudgetMeter` stays dumb JSX.
`toBudgetTotal` / `toBudgetRows` are unchanged.

### 3. `Breakdown.tsx` — new optional `limits?: Map<string, number>` prop

Per row, keyed by category name:

- **budgeted** (`limits.has(key)`): header right side shows `฿4,200 / ฿5,000`; the bar is
  replaced by a `BudgetMeter` built from `toBudgetTotal(limit, Math.abs(row.total))`.
- **unbudgeted:** unchanged — current accent bar sized relative to the biggest spender,
  amount only.

When `limits` is omitted or empty, behavior is identical to today (the Records/other
callers of `Breakdown` pass no limits and are unaffected).

### 4. `page.tsx` — feed the data

- `ensureBudgetsTable(db)` alongside the other `ensure*` bootstraps.
- `getBudgets(db)`; split the `category === null` row out as the **total** limit; build a
  `Map<category, amount>` from the rest.
- Pass the `Map` as `limits` to `<Breakdown />` (List view).
- In the Chart view, below `<DonutChart />`, render one `<BudgetMeter />` for the total —
  **only when the total limit is set** — built from `toBudgetTotal(totalLimit, total)`
  (`total` is already computed on the page from the slices).

## Scope boundaries (YAGNI)

- No schema change, no query change, no new dependency.
- No per-cycle budget overrides (standing budgets only — already the model).
- No "set budget" affordance on unbudgeted rows (explicitly declined).
- No change to the donut hole or the donut ring.
- `Breakdown`'s other callers are untouched (the prop is optional).

## Testing

- `meterColorVar` gets a co-located unit test (each state → expected token).
- `BudgetMeter` is otherwise trivial presentational JSX — no separate test beyond the
  color helper.
- No changes to the already-tested `toBudgetTotal` / `toBudgetRows`, so their suites
  stand.

## Files

- **New:** `src/features/budgets/ui/BudgetMeter.tsx`
- **Edited:** `src/features/budgets/budget-status.ts` (+ `meterColorVar`, + test),
  `src/features/entries/ui/Breakdown.tsx`, `src/app/page.tsx`
