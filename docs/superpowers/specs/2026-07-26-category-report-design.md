# Category report — design

**Date:** 2026-07-26
**Status:** approved, ready to plan

## The question this page answers

"Pick a category, then show me what it costs over time." Neither existing surface answers it:

| surface | window | category scope |
| --- | --- | --- |
| Home | this cycle | breakdown only |
| `/analytics` (Trends) | last 6 cycles | yes (`?category=`) |
| `/month` | one calendar month, every year | yes (`?category=`) |
| `/year` | one cycle-aligned year | **no** |

Trends can scope a category but only over six cycles; `/year` holds a whole year but cannot scope
one. Nothing lets you sit on one category and step through years, and there is no doorway that
starts from "which category" — `/categories` jumps straight to a flat `/records` list.

## Route

`/report` — a new route.

`/report`, not `/category`: the app already has `/categories` (icon/hue/off-budget management), and
two routes a letter apart would be a permanent source of wrong links.

Params:

| param | values | meaning |
| --- | --- | --- |
| `category` | category name | absent → the picker list; present → that category's report |
| `view` | `monthly` (default) \| `yearly` | granularity **and** window (see below) |
| `year` | e.g. `2026` | which year, `monthly` only. Absent/junk → current year, clamped to range |

Reached from the More sheet's **Review** group (tile label: `Report`), beside Year and Month.

## One route, two states

The pattern `/month` and `/analytics` already use — no `?category=` shows the list, `?category=`
shows the report, and a `HeaderFilterChip` clears back to the list.

```
/report                       /report?category=Food+%26+Drink
┌──────────────── ‹ 2026 › ┐  ┌──────────────────────────────┐
│ 🍴 Food & Drink  ฿48,200 ›│  │ [✕ Food & Drink]  ‹ 2026 ›   │
│ 🚗 Transport     ฿22,100 ›│  │ [ Monthly | Yearly ]         │
│ 🏠 Home          ฿18,400 ›│  │ ฿48,200                      │
│ 🎮 Fun            ฿9,300 ›│  │ ▁▃▅▂▇▃▁▄▂▅▃▂                 │
└───────────────────────────┘  │ Averaging ฿4,010 / 11 months │
                               │ Jan ฿3,100 (12)            › │
                               │ Feb ฿4,880 (17)            › │
                               │ Mar ฿0            (muted)    │
                               └──────────────────────────────┘
```

## The toggle IS the window switch

Granularity and window move together. This is the load-bearing decision: it keeps the list and the
chart describing the same span, so the number you tap is the headline you land on.

| `view` | window | bars | stepper |
| --- | --- | --- | --- |
| `monthly` (default) | one cycle-aligned year — `cyclesInYear(year, currentKey, cutoff)` | 12, one per cycle, `monthLabel` | ‹ year › |
| `yearly` | every tracked year, `firstYear…currentYear` | one per year, label = the year | **hidden** — there is nothing to step |

The picker list obeys the same window: in `monthly` its totals are that year's, in `yearly` they are
all-time. Both the toggle and the stepper therefore render in **both** states — they describe the
window, and the list has a window too.

`partial` marks the live period in both views — the current cycle in `monthly`, the current year in
`yearly` — so `completeBars` / `trendAverage` withhold the average line and its caption on the same
terms as everywhere else in the app.

## Report body

Rows only. No stat tiles, no top notes, no weekday card.

1. Header — category name, window total (`formatBahtWhole`).
2. `HeaderFilterChip` → clears `category`, back to the list.
3. Monthly/Yearly toggle (links, not state — the view lives in the URL like every other filter).
4. `TrendChart bars={bars} budget={null}`.
5. Average caption — "Averaging ฿X across N completed months/years", basis = `completeBars(bars).length`,
   never `bars.length` (a true mean under a false denominator is the bug `/month` already fixed).
6. Period rows, one per bar, summing to the headline above.

Row targets:

| view | row | href |
| --- | --- | --- |
| `monthly` | a cycle | `/records?cycle=2026-07&category=…` |
| `yearly` | a year | `/report?view=monthly&year=2024&category=…` |

A yearly row drills into that year's twelve months rather than to records: `/records` has no
year-window param, and the drill is the more useful move anyway.

Zero rows stay in the list — "you spent nothing on this in 2019" is the answer — but render muted and
**unlinked**. `/month` established this: a 44px target that opens an empty list is a tap the
interface promised something for.

## Data

One pure fold + one hook. No new query, **no schema change** — so no `schema.ts` / `BOOTSTRAP_SQL` /
`COLUMN_MIGRATIONS` lockstep work.

- `src/features/entries/category-report.ts` — pure. Takes the breakdown matrix + the window's keys +
  the optional category, returns `{ bars, categories, rows, total }`. Same branch `/month` uses:
  unfiltered sums a row, filtered reads one column.
- `src/features/entries/use-category-report.ts` — the read hook. Resolves cutoff / first date / emoji
  / hue / icon-set, builds the window, fetches, folds. Re-runs on `view`/`year`/`category` change and
  on `useDataVersion()`.

Fetch shape, reusing the `getCategoryBreakdown`-per-window matrix that `use-month.ts` and
`use-analytics.ts` both build (`key → category → {value, count}`):

- `monthly`: one `getCategoryBreakdown` per cycle → 12 calls.
- `yearly`: one per **year window** — a year's cycles are contiguous, so
  `[cyclesInYear(y)[0].start, last.end]` is a single bounded range → N calls, not 12N.

`ponytail:` several bounded aggregates rather than one windowed query, for the reason already
recorded in `use-month.ts` — a cycle boundary is a cutoff-day concept computed in `cycle.ts`, not
something SQL knows. Cheap against local OPFS; collapse it if a slow device ever makes it felt.

Yearly bars are built directly as `TrendBar` values (`{key:'2026', label:'2026', value, partial}`) —
`TrendBar` is a plain type, not tied to a `Cycle`, so no synthetic cycles are needed.

## UI components

New, in `src/features/entries/ui/`:

- `ViewToggle` — Monthly | Yearly, two `<Link>`s preserving `category` and `year`, `aria-current` on
  the active one.
- The year stepper reuses `YearSelector` (already takes `prevHref`/`nextHref`, null closes a
  direction), with hrefs that carry `category` and `view` so stepping never drops the filter — the
  rule `/month`'s stepper already follows.

Reused as-is: `PageContainer`, `TrendChart`, `HeaderFilterChip`, `CategoryIcon`, `RowChevron`,
`EmptyLedger`, `SwipeNav`.

`SwipeNav` wraps everything **below** the stepper only (its transform breaks sticky descendants —
the gotcha recorded on `/month` and `/year`), and only in `monthly`, where there is a neighbouring
year to swipe to.

## Empty states

| condition | result |
| --- | --- |
| ledger has no expenses at all (`firstYear === null`) | `EmptyLedger` |
| ledger fine, this year has nothing | keep the stepper, "Nothing recorded in 2024" |
| category has no spend in the window | chart of zeros + rows of zeros, average caption withheld |

Never swap the page for `EmptyLedger` on an empty *year* — the stepper is the only way back out
(`/year`'s rule).

## Testing

- `category-report.test.ts` — the fold: unfiltered ranking, filtered column read, zero rows kept,
  totals sum to the headline, `partial` on the live period in both views.
- `use-category-report.test.ts` — `renderHook` against the Node shim: default year, clamped `?year=`,
  `view=yearly` window spans `firstYear…currentYear`, refetch on data-version bump.

Both run on the better-sqlite3 shim, so they prove the queries and the fold, never the worker or the
layout. Verify at 412px in a real browser before calling it done.

## Deliberately not built

- Stat tiles (biggest month / average), top notes, weekday card — the report is rows-only. Add if it
  reads thin.
- Linking `/year`'s "Top categories" rows into `/report` — a one-line change, available whenever a
  second doorway is wanted.
- Account-scoped reports. `/analytics` already has the by-account toggle; duplicating it here would
  double the matrix work for a question Trends answers.
