# Insight Round — Design

**Date:** 2026-07-24
**Branch:** `feat/insight-round`
**Status:** approved, ready for planning

## Summary

Four small, independent read-side features that answer new questions of data
Moniflow already stores. Every one is a **pure function + a thin render** — no
new column, no `BOOTSTRAP_SQL` edit, no schema-lockstep test, no Monefy-CSV /
Drive-backup change. That shared property is why they cluster into one round.

One spec → one plan → four independently-committable tasks, ordered by value ×
certainty. **H is the cut line** — drop it if effort balloons; the round still
stands on I / G / F.

Ideas explicitly considered and dropped from this round:

- **B — note autocomplete:** already shipped. `getDistinctNotes` (queries.ts)
  feeds the note field's `<datalist>` (`Keypad.tsx:372`). Nothing to build.
- **D — receipt photos:** blobs cannot round-trip through the Monefy CSV backup,
  so attaching them silently breaks the only backup path. A finance app must not
  do that quietly. Deferred to its own project that first redesigns the backup
  format to hold binary assets.

## Constraints (why this stays cheap)

- The ledger is **outflow-only** — every read query enforces `amount < 0`.
  Nothing here touches that invariant.
- **Monefy CSV is the backup format.** Anything CSV can't represent stops being
  backed up. None of these four persist anything new, so backup stays whole.
- **Reads are async, post-mount.** Each feature's hook returns `{ ready, data }`;
  routes render a placeholder until `ready`. No synchronous read is introduced.
- **412px verification.** Vitest runs the Node shim and proves the queries only —
  never the worker, OPFS, or layout. Each feature is driven in a real browser at
  412px before it is called done.

## Feature I — Upcoming bills (priority)

**Problem it fixes:** the dashboard's safe-to-spend today divides
`remaining budget ÷ days left` with no knowledge of recurring bills that will
post before the cycle ends. It tells you you're fine on the 24th, then rent
posts. That number is *wrong*, not merely incomplete.

**Build:**

1. **New pure fn** in `src/features/recurring/schedule.ts`:
   `postsBetween(rule, afterIso, throughIso): Due[]` — a bounded variant of the
   existing `duePosts`: occurrences in the half-open window `(afterIso, throughIso]`,
   respecting `maxPosts(rule)` (cap) and `lastPosted`. Co-located `*.test.ts`.
2. **New pure module** `src/features/entries/upcoming.ts`:
   `committedThisCycle(rules, todayIso, cycleEndIso): { total: number; count: number }`
   — sums `rule.amount` (stored POSITIVE) over each rule's `postsBetween(today, cycleEnd)`.
   Co-located test.
3. **Dashboard math change** — `src/features/entries/dashboard.ts`:
   `safeToSpendPerDay` gains a `committed` parameter:
   `remaining = totalBudget − spent − committed`, still floored at 0, still null
   when `totalBudget === null`. Update `dashboard.test.ts`.
4. **`src/features/entries/use-dashboard.ts`**: add `listRules(db)` to the parallel
   load; compute `committed` via `committedThisCycle`; pass it to `safeToSpendPerDay`;
   expose `upcoming: { total, count }` on `DashboardData`.
5. **`src/features/entries/ui/DashboardCards.tsx`**: one line —
   *"Upcoming: ฿X · N bills due"* — with safe-to-spend now reflecting it.

**Scope decision (approved):** committed bills adjust **safe-to-spend only**. The
pace-based `projected` total stays untouched — it is a linear extrapolation from
*actual* spend, and folding known-future bills into a pace projection
double-counts. Safe-to-spend is a budget question ("what's left to allocate");
projection is a pace question ("where am I heading at this rate"). They stay
separate.

**Edge cases:** no budget set → `safeToSpendPerDay` already returns null (UI shows
the actual average); the upcoming line still renders informationally. A rule with
no occurrence before cycle end contributes nothing. Rules already posted this
cycle are excluded by `lastPosted`.

## Feature G — Top notes

**Problem:** the category breakdown answers "which category", never "which
merchant / what exactly". The note column already holds that.

**Build:**

1. **New pure fn** `src/features/entries/by-note.ts`:
   `topNotes(entries): { note: string; total: number; count: number }[]`, sorted
   by `total` descending, blank/null notes collapsed into a single "No note"
   bucket. Mirrors `breakdown.ts`. Co-located test.
2. **Render:** a ranked-list section on `/analytics`, scoped to the anchor cycle,
   reusing the `LegendRow` visual idiom. No chart — a ranked list is the honest
   form for free-text keys.

**Scope:** cycle-scoped (the analytics anchor cycle), matching the breakdown's
scope. Uses `getEntriesInRange` for that cycle; no new query.

## Feature F — Spend heatmap

**Problem:** there is no day-granular glance view of a cycle's spending.

**Build:**

1. **New pure fn** `src/features/entries/heatmap.ts`:
   `toHeatmapCells(dayGroups, cycle): { date: string; total: number; intensity: number }[]`
   — one cell per day in the cycle, `intensity` bucketed against the cycle's max
   day total (empty days included as real zeros). Co-located test.
2. **Render:** a **CSS grid** (7 columns), *not* an ECharts calendar — the ECharts
   calendar coordinate is cramped at 412px and pulls chart weight for a layout CSS
   does natively; intensity maps to a themed background token. Tapping a day
   navigates to `/records` filtered to that date. Sits under the trend chart on
   `/analytics`, anchor-cycle scoped.

**Scope:** cycle-scoped. Reuses `groupByDate` (by-date.ts) over the cycle's
entries. Tap-through reuses whatever day-filtering Records already exposes; if
none exists, the plan adds the smallest possible date filter — not a new records
subsystem.

## Feature H — Anomaly flag (cut line)

**Problem:** nothing surfaces "this category is unusually high for you this cycle".

**Build:**

1. **New pure fn** `src/features/entries/anomaly.ts`:
   `anomalies(perCategoryPerCycle, threshold = 1.5): { category, current, avg, ratio }[]`
   — flags categories whose current-cycle spend is ≥ `threshold` × their own
   average across **complete, non-pre-tracking** cycles. Reuses the exclusion
   logic behind `trend.ts` `completeBars` (skip the partial cycle; skip zeros that
   mean "not tracking yet") so a spike isn't faked by thin history. Requires ≥2
   qualifying cycles per category or the category is skipped. Co-located test.
2. **Data plumbing — the one real cost:** H needs per-category spend across the
   6-cycle window. **First task in the plan: check whether `use-analytics` already
   assembles this**; extend that hook if so, rather than firing a fresh 6× query.
3. **Render:** a dashboard banner showing the **worst 1–2 offenders only** —
   *"⚠️ Food 2.3× your usual"* — capped to stay a signal, not noise.

**Why it's the cut line:** it is the only feature that may need a genuine query
addition (per-category × per-cycle). If that plumbing turns out heavy, drop H;
I / G / F are unaffected.

## Testing & verification

- TDD per repo norm: each pure fn gets a co-located `*.test.ts` written first.
- Each new/changed hook gets a `renderHook` test.
- Quality gates before each commit: `format:files` → `typecheck` → `lint` →
  `format:check` → `test`.
- Every feature driven in a real browser at 412px before it is called done.

## Build order

`I → G → F → H` — value × certainty descending, H last (riskiest plumbing).
Each is an independent commit; the round can stop after any of them.
