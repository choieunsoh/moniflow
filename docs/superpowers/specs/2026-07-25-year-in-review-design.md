# Spec B — Year in review (`/year`)

**Date:** 2026-07-25
**Status:** Design — awaiting review
**Scope:** A low-frequency, scrollable "last 12 cycles" summary surface, reached from the More sheet.
No new DB column/table; runs off a single `getEntriesInRange` over the 12-cycle span, grouped in JS.

## Goal

Give the user a periodic "where did the year go" recap: total, the 12-cycle shape, the heaviest
categories and month, the single biggest purchase and top merchants, and the weekly rhythm — all over
a trailing 12-cycle window. This is the deferred #6 from the spending-insights brainstorm; Spec A
(drill-down) already shipped as v1.3.0.

## Decisions (from brainstorming)

- **"Year" = trailing 12 cycles** ending at the active cycle (`lastCycles(activeKey, 12, cutoff)`).
  moniflow has no calendar-month concept — everything is billing cycles keyed `YYYY-MM` — so a
  calendar Jan–Dec view would fight the model, and year-over-year is thin (history starts ~2026). No
  year picker, no YoY comparison (YAGNI).
- **Placement: a new `/year` route in the More sheet**, alongside Trips/Recurring/etc. Not a bottom
  tab (low frequency). Bottom tabs unchanged.
- **Contents (all four groups the user picked):** headline total + 12-cycle bar trend; top categories
  + biggest month; biggest single transaction + top merchants; average per cycle + day-of-week rhythm.

## Non-goals

- No year-over-year / previous-period comparison, no calendar-year picker, no CSV export of the recap.
- No new stored data, no schema/`worker.ts`/migration changes, no new query function — `getEntriesInRange`
  already exists and returns expenses only.

## Architecture (maximal reuse)

**One query, grouped in JS.** The window is contiguous cycles, so `[cycles[0].start,
cycles[11].end]` covers everything; a single `getEntriesInRange` feeds every stat.

### `src/features/entries/year.ts` (pure, tested)

```
export type YearCategory = { name: string; value: number; count: number };
export type YearSummary = {
  total: number;
  bars: TrendBar[];                                    // 12, oldest→newest (reuse toTrendBars)
  categories: YearCategory[];                          // window-wide, biggest first, no zero tail
  biggestMonth: { key: string; label: string; value: number } | null;  // over COMPLETE cycles
  biggestTransaction: EntryRow | null;                 // topTransactions(entries, 1)[0]
  topNotes: NoteRow[];                                 // topNotes(entries)
  weekday: WeekdayStats;                               // byWeekday(entries)
  avgPerCycle: number | null;                          // ÷ complete cycles with spend; null if none
  activeCycleCount: number;                            // # complete cycles with spend
};
export function yearSummary(entries: EntryRow[], cycles: Cycle[], currentKey: string): YearSummary
```

- Buckets each entry into its cycle by date range (`e.date >= c.start && e.date <= c.end`, string
  compare on `YYYY-MM-DD` — pure, no cycle math inside). Sums per-cycle totals and per-category totals
  (magnitudes) in one pass, then reuses `toTrendBars`, `completeBars`, `topTransactions`, `topNotes`,
  `byWeekday`.
- `biggestMonth` and `avgPerCycle` both use `completeBars(bars)` (excludes the live partial cycle and
  zero cycles) — the same honesty the trend average already applies; a mid-cycle partial must not be
  crowned "biggest month".

### `src/features/entries/use-year.ts` (read hook)

```
export const YEAR_CYCLES = 12;
export type YearData = YearSummary & { emojiMap; hueMap; iconSet };
export function useYear(cycleKey: string | null): { ready: boolean; data: YearData | null }
```

Mirrors `use-analytics`: `getCutoff` → `currentCycleKey`/`lastCycles(activeKey, 12, cutoff)` → one
`getEntriesInRange(cycles[0].start, cycles[11].end)` + emoji/hue/iconSet maps → `yearSummary(...)`.
Re-runs on `?cycle=` change or `useDataVersion`.

### `src/app/year/page.tsx` (route)

`'use client'`, reads `?cycle=`, `useYear`, `PageContainer size="full"`. `…` skeleton until `ready`;
`EmptyLedger` when `categories.length === 0`. Renders top→bottom:
1. Headline: window label + `formatBahtWhole(total)` + `TrendChart bars={bars} budget={null}`.
2. Top categories list (reuse the analytics row pattern: `CategoryIcon` + name + count + `formatBahtWhole`).
3. Stat row: **Biggest month** (`biggestMonth.label` + value), **Average / cycle** (`avgPerCycle`),
   **Biggest purchase** (the entry's note/category + amount, links to `/entries/edit?id=`). Each
   guards its null/empty case.
4. `TopNotesList notes={topNotes}` (top merchants) + `WeekdayCard stats={weekday}` (reused as-is).

### `src/shared/ui/MoreSheet.tsx`

Add one `LINKS` entry: `{ href: '/year', label: 'Year', Icon: CalendarRange, cycle: false }` (import
`CalendarRange` from `lucide-react`; tile label kept short "Year", page `<h1>` is "Year in review").

## Files

New (each with co-located test where logic warrants):
- `src/features/entries/year.ts` (+ `year.test.ts`)
- `src/features/entries/use-year.ts` (+ `use-year.test.ts`)
- `src/app/year/page.tsx`

Modified:
- `src/shared/ui/MoreSheet.tsx` — one grid entry + one icon import.

## Testing

- `yearSummary`: bucketing into cycles (boundary dates), window-wide category ranking, biggest-month
  over complete cycles only (a bigger partial cycle is NOT chosen), avg over complete-with-spend,
  biggest transaction/top notes/weekday delegation, empty input.
- `useYear`: renderHook against the Node shim (reuse the analytics test harness) — total + bars +
  categories for a seeded multi-cycle ledger; empty ledger → `categories: []`.
- Verify at **412px in a browser** — the new route, the 12-bar chart's label density, and the More
  sheet tile.

## Ceilings (ponytail)

- `lastCycles` always returns 12, so a young ledger shows leading zero-bars — honest (matches the
  trend); `biggestMonth`/`avgPerCycle` exclude them so figures aren't dragged.
- 12 x-axis labels at 412px are tighter than the trend's 6 — the plan verifies density and rotates/thins
  if needed (ECharts `axisLabel`), no new component.
- `cycles.find` per entry is O(entries×12) — trivial for a single-user ledger; upgrade to a keyed
  bucket only if it ever bites.
