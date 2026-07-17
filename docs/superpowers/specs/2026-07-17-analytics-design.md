# Analytics — design

Date: 2026-07-17
Status: approved, pending implementation plan

## Problem

Moniflow can tell you what you spent this cycle and nothing about whether that is normal for you.
Every read surface is locked to a single cycle: `useHome(cycleParam)` resolves one `Cycle` and calls
`getCategoryBreakdown(db, start, end)` for that one range. The `CycleSelector` steps between cycles
one at a time, but nothing ever puts two cycles side by side. There is no time series anywhere in
the codebase.

The app has exactly one chart — the spending donut (`donut.ts` + `DonutChart.tsx`). `Breakdown`,
`BudgetMeter` and `CycleProgress` are CSS bars, not charts. ECharts 6 is a dependency used by that
single donut.

Three questions the ledger holds the answers to and the UI cannot ask:

- **Am I spending more than usual?** — this cycle's total against the recent ones.
- **Where is my money actually going, over time?** — is Food creeping up while Transport falls?
- **Do my budgets fit my actual spending?** — the `BudgetMeter` exists, but only for the live cycle.

## Goals

- One place to zoom out from the current cycle and see six of them at once.
- Drill from the total trend into a single category's history without leaving the chart.
- Answer whether the budgets you have set now actually fit how you spend.
- Add no schema change, no new dependency, and no new SQL.

## Non-goals

- **Budget history / compliance records.** Budgets are standing (see "Budgets have no history"). We
  do not version them and we do not claim to know what your limit was in March.
- **Income or net-flow analytics.** The ledger is outflows only (see CLAUDE.md); analytics is too.
- **Windows other than six cycles.** No range picker. One more control on a phone screen and more
  state to test, for a question that six cycles already answers.
- **Stacked composition charts.** Six bars × six categories at 412px is a mush of unreadable
  slivers. Composition is served by the category filter instead.
- **Forecasting or projection.** The chart shows what happened, not what will.

## Decisions

| Decision              | Choice                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| Surface               | New `/analytics` route, promoted into the tab bar                        |
| Tab bar cost          | Budgets demoted into the More sheet                                      |
| Window                | Last 6 cycles, fixed, oldest → newest, anchored to `?cycle=`             |
| Structure             | Two views (`?view=trend` default, `?view=budgets`)                       |
| Category drill-down   | A filter (`?category=`) on the trend view, not a third view              |
| Data primitive        | `getCategoryBreakdown` called once per cycle — no new SQL                |
| Budget comparison     | Against **current** limits, labelled as such                             |
| Partial cycle         | Current cycle's bar rendered muted — never compared as if complete       |

## Navigation

The bottom bar is a hard `grid-cols-5`: Home · Records · ＋ FAB · Budgets · More. There is no sixth
slot. Analytics takes the Budgets slot; Budgets moves into the `MoreSheet` `LINKS` grid with the
lucide `Target` icon (`Wallet` is already taken by Accounts).

Final bar: **Home · Records · ＋ · Analytics · More**.

Analytics reads a cycle, so its tab is wrapped in `cycleHref('/analytics', cycle)` alongside Home
and Records. The six-cycle window is **anchored to `?cycle=`**, not to today: stepping to March on
Home and tapping Analytics shows the six cycles ending March. Absent the param it falls back to
`currentCycleKey`, as `use-home` already does. This keeps the window consistent with the cycle the
rest of the app is showing, and makes the trend reachable for any point in history.

### The cycle-param regression this creates

`BottomBar` wraps primary tabs in `cycleHref('/budgets', cycle)` so the selected cycle survives
Home ↔ Records ↔ Budgets. `MoreSheet`'s `LINKS` are bare `href` strings, and its comment justifies
this: _"the More sheet's links go to pages that don't read a cycle, so they stay bare."_

Budgets **does** read a cycle. Demoted as-is, it silently loses the cycle selection on every tap.
`MoreSheet` therefore gains `useSearchParams` and a `cycle: true` flag on the Budgets entry, applying
`cycleHref` to flagged links only. The stale comment gets corrected in the same change.

## Data layer

One new pure function in `cycle.ts`:

```ts
// The last n cycles ending at `key`, oldest first.
export function lastCycles(key: string, n: number, cutoff = CUTOFF): Cycle[];
```

`stepKey` and `cycleFromKey` already exist, so this is a map over an index range.

One new hook, `src/features/entries/use-analytics.ts`, returning `{ ready, data }` like every other
read hook. It resolves the cutoff from settings (as `use-home` does), enumerates the six cycles, and
calls the **existing** `getCategoryBreakdown(db, start, end)` once per cycle via `Promise.all`. The
result is the cycle × category matrix that all three questions project out of:

- **Total trend** — sum each cycle's row.
- **Category trend** — read one column across cycles.
- **Budget fit** — compare the matrix against `getBudgets`.

No new query, no new SQL, no new query tests.

### Why six queries and not one clever one

The cycle boundary is a cutoff-day concept computed in `cycle.ts`, not something SQL knows about.
Expressing six cycles in one statement means either a `CASE` ladder encoding the cutoff, or fetching
raw rows over the whole span and bucketing in JS — and the latter defeats the `GROUP BY` that
`getCategoryBreakdown`'s comment exists to protect ("so a cycle view never loads the full 10-year
ledger").

Six bounded, indexed, already-tested aggregates against a local OPFS database is the boring correct
answer. The hook carries a `ponytail:` comment naming the ceiling: six round-trips per load, collapse
into a windowed query if a slow device ever makes it felt.

## Trend view (`?view=trend`, default)

Follows the repo's chart rule (CLAUDE.md: "Charts = pure, tested option-builders + thin React
wrappers") and mirrors the existing `donut.ts` / `DonutChart.tsx` split exactly:

- `src/features/entries/trend.ts` — pure option-builder, unit-tested.
- `src/features/entries/ui/TrendChart.tsx` — thin ECharts wrapper.

Six bars, one per cycle, oldest → newest, the anchor cycle last and accented.

Below the chart, the category list reuses `CategoryGlyph` and the top-N + "Other" bucket already
implemented in `donut.ts`. Tapping a category sets `?category=` and the **same chart** re-renders as
that category's six-cycle history, with a `HeaderFilterChip` to clear it. The `?category=` param
mirrors `/records`, which already filters this way.

The synthetic "Other" bucket is not a real category and is not tappable — the same rule the home
donut's legend already follows.

### The partial-cycle bar

The current cycle is incomplete. Drawing it at full strength next to five finished cycles is the
classic trend-chart lie — every current cycle looks like a spending drop until the day it ends. Its
bar renders muted, and `CycleProgress` already computes how far through the cycle we are.

This treatment applies **only to the live cycle**, keyed off the `isCurrentCycle` flag `use-home`
already derives — not to "the last bar". Anchored to March, all six bars are complete and all six
render at full strength. Anchored to today, only the last one is muted.

## Budgets view (`?view=budgets`)

### Budgets have no history

`schema.ts` is explicit: _"Standing budgets — no cycle column; the same limit applies to every
billing cycle."_ One row per category, and `setBudget` **delete+inserts** it — a changed limit is
gone, not superseded. The app has no record of what any past cycle's budget was.

Versioning the table (an `effective_from` column) was considered and rejected. It would not help:
history would start accruing from today, so the six cycles we want to show would be blank and stay
blank for six months. The cost is a schema change in two places (`schema.ts` **and** `BOOTSTRAP_SQL`
— the repo's lockstep rule) plus the CSV backup format, in exchange for an empty chart.

### What it shows instead

Each cycle's spend compared against your limits **as they stand today**, framed honestly as a
budget-tuning tool rather than a compliance record: _"with the limits I have now, how often would I
have blown them?"_ That is the question the data can actually answer, and the more useful one for
setting a budget.

Per budgeted category: a row of six mini bars against the current limit, over-limit bars in the
danger colour, with a headline of the form _"4 of 6 cycles would have held."_ The view header states
plainly: **"Against your current limits."**

Pure CSS bars — `BudgetMeter` already does exactly this. No ECharts.

## Testing

- `lastCycles` — unit tests (pure): window size, ordering, month/year rollover, cutoff respected.
- `trend.ts` option-builder — unit tests (pure), as `donut.test.ts` does.
- `use-analytics` — a `renderHook` test, per the repo's custom-hook rule.
- Budget-fit projection (spend vs current limit per cycle) — unit tests on the pure function.

Tests run against the Node shim and prove the queries only. Per CLAUDE.md, the feature is not done
until it has been driven in a real browser at 412px — the tests prove nothing about the worker, OPFS,
or layout.

## Files

| File                                        | Change                                            |
| ------------------------------------------- | ------------------------------------------------- |
| `src/app/analytics/page.tsx`                 | new — `'use client'` route, reads `?view=`/`?category=` |
| `src/features/entries/cycle.ts`              | add `lastCycles`                                  |
| `src/features/entries/trend.ts`              | new — pure option-builder                         |
| `src/features/entries/ui/TrendChart.tsx`     | new — thin ECharts wrapper                        |
| `src/features/entries/use-analytics.ts`      | new — read hook                                   |
| `src/features/budgets/budget-status.ts`      | add the per-cycle fit projection                  |
| `src/shared/ui/BottomBar.tsx`                | Budgets slot → Analytics                          |
| `src/shared/ui/MoreSheet.tsx`                | add Budgets; carry `cycle` on flagged links       |
