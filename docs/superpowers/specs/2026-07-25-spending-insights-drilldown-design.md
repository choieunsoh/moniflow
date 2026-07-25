# Spec A — "Where did it go?" spending-insights drill-down

**Date:** 2026-07-25
**Status:** Design — awaiting review
**Scope:** Three focused additions to the Trends (`/analytics`) surface that make the existing
spending data explain itself. No new stored data, no schema/OPFS migration.

## Goal

Moniflow already answers *what* you spent (Home donut, category breakdown) and *is it normal*
(Trends 6-cycle trend, anomaly flags). It does not answer **"where did it go and what changed?"**
well. This spec closes that gap by surfacing three things from data the app already computes.

## Non-goals

- **No savings / net worth / income / debt.** Those live in the user's other financial app; moniflow
  stays deliberately outflows-only.
- **No new "category deep-dive" route.** The `?category=` filtered analytics view already *is* the
  category deep-dive (per-category 6-cycle trend + per-cycle breakdown list + budget line +
  records link). We enrich it, not rebuild it.
- **No rebuild of merchant/note rollup or biggest-transactions.** `by-note.ts` / `TopNotesList` and
  `top-transactions.ts` / `TopTransactionsList` already exist and are reused as-is.
- **Year-in-review is out** — it is a separate later spec (different cadence, different surface).

## The three additions

### 1. "What changed" — category contributors on the delta card (app-wide, unfiltered)

Today `CycleDeltaCard` shows only the *total* delta ("↑ ฿1,200 more than last cycle"). It never says
*which categories* drove it. Add the top movers.

- **New pure fn** `deltaByCategory(matrix, activeKey, prevKey)` in a new
  `src/features/entries/delta-breakdown.ts`:
  - `matrix`: the existing `Map<cycleKey, Map<category, {total,count}>>` (magnitudes) already built in
    `use-analytics`.
  - Returns ranked `{ category: string; delta: number }[]`, sorted by `|delta|` descending, where
    `delta = active.total − prev.total` for every category present in *either* cycle. Positive =
    spent more this cycle. New categories (absent in prev) and dropped categories (absent in active)
    are handled by treating the missing side as 0.
  - Caller slices to top N (default 4).
- **`CycleDeltaCard`** gains an optional `contributors` prop + category icon/hue maps and renders each
  as a small row under the headline: category disc + name + `↑/↓ ฿X`, coloured `up = loss` /
  `down = accent` (matching the existing headline colour logic).
- Shown **unfiltered only** — same guard as the existing total delta.

### 2. Enriched category view (filtered `?category=`)

The filtered view already has the trend, per-cycle list, budget line, and records link. Add three
things, all by feeding **category-filtered entries** to helpers that already exist:

- **Per-category "vs last cycle"** *(user-requested)* — when filtered, `bars` already holds *this
  category's* per-cycle spend, so `cycleDelta(lastBar.value, prevBar.value > 0 ? prevBar.value : null)`
  gives the category's current-vs-previous delta directly. Render the same `CycleDeltaCard` in the
  filtered branch. (Today `delta` is hard-`null` when filtered — lift that restriction.)
- **Biggest transactions in this category** — `topTransactions(activeCycleEntries.filter(e => e.category === category))`.
  Render the existing `TopTransactionsList`.
- **Note/merchant rollup in this category** — `topNotes(activeCycleEntries.filter(e => e.category === category))`.
  Render the existing `TopNotesList`.

**Window scoping (must be stated in the UI):** the trend and the per-category delta span the window's
last two cycles; biggest-transactions and notes are the **active cycle only** — matching the existing
app-wide convention (`TopNotesList` on Trends is already current-cycle). The category panel subtitle
should make this explicit so a user does not misread the biggest-tx list as windowed.

### 3. Day-of-week patterns (app-wide, unfiltered)

- **New pure fn** `byWeekday(entries)` in `src/features/entries/by-weekday.ts` → seven buckets keyed
  Mon–Sun with `{ total, count }` (magnitudes), plus derived `peakDay` and a weekend-vs-weekday ratio.
  Weekday comes from the UTC date key via
  `new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })` — date keys are
  UTC-stable per the code-style rule; no string slicing.
- **New `WeekdayCard.tsx`** — a compact seven-bar row (reusing the `tabular-nums` + hue conventions)
  with a one-line takeaway ("Fridays are your peak · weekends run 1.8× weekdays"). Active cycle.
- **Placement:** the supporting block on Trends, alongside `SpendHeatmap` and `TopNotesList`.
  Unfiltered only (a single category rarely has enough data per weekday to be meaningful).

## Data flow

All three read from data `use-analytics` already fetches — no new query, no new column, no migration:

| Addition | Source (already in `use-analytics`) |
|---|---|
| 1. What changed | `matrix` (active + prev cycle) → `deltaByCategory` |
| 2. Per-category delta | `bars` (last two, filtered = this category) → `cycleDelta` |
| 2. Category biggest-tx / notes | `cycleEntries` (active cycle) filtered by category → `topTransactions` / `topNotes` |
| 3. Weekday | `cycleEntries` (active cycle) → `byWeekday` |

## Files

**New** (each with a co-located `*.test.ts`, TDD — failing test first):
- `src/features/entries/delta-breakdown.ts` (+ test)
- `src/features/entries/by-weekday.ts` (+ test)
- `src/features/entries/ui/WeekdayCard.tsx` (+ test)

**Changed:**
- `src/features/entries/use-analytics.ts` — extend `AnalyticsData` with `deltaBreakdown`, filtered-branch
  `delta`, category-scoped `categoryTransactions` + `categoryNotes`, and `weekday`.
- `src/features/entries/ui/CycleDeltaCard.tsx` — optional `contributors` rows.
- `src/app/analytics/page.tsx` — mount `CycleDeltaCard` (with delta) + `TopTransactionsList` +
  `TopNotesList` in the filtered branch; mount `WeekdayCard` in the supporting block.

## Testing

- Pure fns fully unit-tested. `deltaByCategory`: increases, decreases, new category, dropped category,
  tie ordering, empty. `byWeekday`: bucketing, empty input, peak selection, weekend ratio, thin-sample
  copy softening.
- Card components get render tests per the project's "charts are tested option-builders + thin React
  wrapper" norm.
- Verify at **412px in a real browser** — the Node shim proves the queries, never the worker, OPFS,
  or layout.

## Build order

1. `deltaByCategory` + `CycleDeltaCard` contributors (addition 1) — highest value, self-contained.
2. Filtered-branch per-category delta (addition 2, user-requested) — smallest change, lifts one guard.
3. Category-scoped biggest-tx + notes (rest of addition 2) — wiring existing components.
4. `byWeekday` + `WeekdayCard` (addition 3).

## Ceilings (ponytail)

- Biggest-tx and notes in the category view are **active-cycle only**, not windowed — matches the
  existing convention; widen to the window later only if it is felt.
- `byWeekday` runs over the **active cycle only**, so early in a cycle the sample is thin — the card
  softens its copy when counts are low, the same honesty the trend subtitle already applies.
- `deltaByCategory` recomputes from the in-memory `matrix`; no new DB round-trip.
