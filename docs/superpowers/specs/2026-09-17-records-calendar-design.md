# Records calendar view — design

**Date:** 2026-09-17 · **Branch:** `feat/records-calendar`

## Goal

A month-calendar view of a billing cycle where you **tap a day to see that day's entries**, and each
day shows **which kinds of money moved**: a fixed bill that posted, a bill still to come, and
off-budget spend. Plus a fix for an existing contrast bug in the Trends heatmap.

## Decisions (and why)

| Decision | Choice | Rejected |
| --- | --- | --- |
| Where it lives | A 4th Records view, `?view=calendar` | Tappable Trends card (Trends is "over time", not an edit surface); new `/calendar` route (duplicates Records' cycle + SwipeRow machinery, one more menu tile) |
| Window | The **billing cycle**, like every other surface | Calendar month |
| How day kinds are marked | Glyph marks under the day number: `●` bill posted, `○` bill upcoming, `◆` off-budget | Per-kind colour (hue = category identity, accent = `--action`, darkness = spend: all three channels are taken; a day with two kinds can show only one colour; colour-only signal); segmented bottom bar (unreadable at 412px) |
| What the cell darkness means | **Discretionary** spend only (`discretionaryByDate`), on BOTH Records and Trends | All-in (a ฿20k rent day pins the max and flattens every other day to intensity 1) |
| Grid component | ONE shared `CalendarGrid`, used by Trends and Records | A second grid for Records (the contrast bug would survive on Trends, two layouts to keep in step) |
| Selected day | URL `?day=YYYY-MM-DD` | Local state (lost on Edit → back) |

"Recurring" and "fixed bill" are **the same fact** in this codebase: `isFixed(entry)` is
`source === 'recurring'`. The only split that exists in data is posted (a row in the ledger) vs
upcoming (a rule date not yet posted).

## Behaviour

### Route and tab

- `/records?view=calendar&cycle=<key>[&day=YYYY-MM-DD][&category=…][&account=…]`.
- The group-by tabs become `Date · Category · Account · Calendar`. The Calendar tab is
  offered only in the plain cycle view: it is not shown in search, trip, or all-category mode
  (`spanAll`), and `?view=calendar` in those modes falls back to `date`. Hidden under `sort=amount`
  exactly as the other tabs already are.
- `CycleSelector` already carries `view` onto prev/next and builds fresh hrefs, so stepping cycles
  drops `?day=`. That is the intended behaviour (the day belongs to the old cycle).

### Selected day

- `?day=` inside the active cycle → that day.
- Missing or outside the cycle → **today** if today is inside the cycle, else the cycle's **last day**.

### Grid cell

- The day number, the background at intensity 0–4, and 0–3 marks beneath the number.
- **No baht figure in the cell** (a figure like ฿1,240 does not fit a ~50px cell). The figure lives in the selected-day header.
- Intensity comes from `discretionaryByDate`; a day whose refunds outweigh its spend (negative) is 0.
- Every in-cycle cell is a `Link` to its `?day=` (preserving `cycle`, `view`, `category`, `account`),
  with `aria-current="date"` on the selected day and an `aria-label` naming the date, its
  discretionary figure, and its marks in words (e.g. "Wed 17 Sep: ฿240, bill posted, off-budget").
  Padding blanks stay `aria-hidden`.
- The selected day gets a visible outline ring (not colour-only: `aria-current` + ring).
- **Contrast fix:** today intensity 4 renders `--color-text` on `--color-text` (invisible in both
  themes). Each intensity level gets an explicit ink, `var(--color-text)` or `var(--color-surface)`,
  whichever clears 4.5:1 against that level's background in BOTH themes. Expected: 0–1 text, 3–4
  surface; level 2 (the 50% mix) is decided by the test, not by eye.

### Marks, per day

- `●` **posted**: at least one entry that is `isFixed` **and not** `isOffBudget` (off-budget is
  checked first, same precedence as `splitBudgetSpend`, so a recurring row in an off-budget category
  marks `◆` only).
- `◆` **off-budget**: at least one entry that is `isOffBudget`.
- `○` **upcoming**: at least one active rule with a `postsBetween(rule, today, cycle.end)` date on
  that day. So `○` appears only for days **after today** in the **current** cycle, never in a past
  cycle. Today's due bills were already posted by the app-open sweep, so they show as `●`.
- A one-line legend under the grid lists only the mark kinds that appear in this cycle.

### Selected-day list (under the grid)

- Header: the day heading (`formatDayHeading`) + count + day total via `formatLedgerSpend` (the
  same frame as the rows, per the signed-money rule).
- That day's entries in the existing `SwipeRow` (tap → edit, swipe → delete + Undo), newest first.
- Then that day's upcoming bills as **muted, non-swipeable** rows marked `○`: rule name, category
  icon, amount. THB/pinned-rate bills are shown in baht; a blank-rate foreign bill is shown in its own
  currency (the same rule as `committedThisCycle`'s `byCurrency`). Tapping a row → `/recurring/edit?id=<id>`.
  Upcoming bills are **not** added to the header total (they have not happened).
- Empty day → a quiet "Nothing on this day" line.

### Filters

`category` / `account` filters apply to the calendar too: to the entries (already filtered as
`visible`), therefore to intensity and to `●`/`◆`, and to upcoming bills by matching the rule's
resolved names from `listRuleMeta` (`categoryName`, `accountName`). The summary row and "Clear
filter" empty state behave as in the other views. When the cycle (after filters) has no rows,
Records shows its normal empty state (Clear filter, or the first-run panel) in place of the
calendar, same as the other views — so on a fresh cycle's first day upcoming bills are not
reachable through the calendar (Home shows them).

### Trends

`/analytics`' "Daily spending" card renders the same `CalendarGrid` **without** marks or links
(non-interactive, as today), now fed by discretionary spend. The card's heading stays "Daily
spending".

## Architecture

No schema, migration, or backup change.

### Pure modules (`src/features/entries/`)

- `heatmap.ts`: `toHeatmapCells(totals: Map<string, number>, cycle)` takes a per-date spend map
  (positive = spend) in place of `DayGroup[]`; negative values clamp to 0. `eachDay` and
  `toCalendarLayout` are unchanged.
- **new** `calendar-marks.ts`:
  - `type DayMarks = { posted: boolean; upcoming: boolean; offBudget: boolean }`
  - `dayMarks(entries, upcomingDates: string[], offBudgetCategories, travelCurrencies) → Map<string, DayMarks>`
  - Upcoming dates are computed by the caller from `postsBetween` so this stays free of the recurring feature's
    rule shape (entries → recurring is already an allowed feature-to-feature import in `use-home`,
    but the pure module doesn't need it).
- **new** `resolveSelectedDay(dayParam, cycle, today) → string` (in `calendar-marks.ts`).

### Hooks

- `use-records.ts`: `RecordsGroupBy` gains `'calendar'`. When the calendar is active it
  additionally reads `getOffBudgetCategories`, `getTravelCurrencies`, and (current cycle only, like
  `use-home`) `listRules` + `listRuleMeta`. `RecordsParams` gains `day`. `RecordsData` gains
  `calendar: null | { cells, marks, selectedDay, dayEntries, dayBills }`, where
  `dayBills: { id, name, category, amount, currency }[]`. It stays `null` for every other view, so the
  extra reads cost nothing there.
- `use-analytics.ts`: reads the two sets and feeds `discretionaryByDate(cycleEntries, …)` to
  `toHeatmapCells`.

### UI

- `SpendHeatmap.tsx` → **`CalendarGrid.tsx`** with the props
  `{ cells, marks?, selectedDay?, hrefFor?(date) }`. Without `hrefFor` → spans (Trends). With
  `hrefFor` → links. The legend renders only when `marks` is given. The analytics card keeps its
  panel + heading wrapper around it.
- `app/records/page.tsx`: 4th `ViewLink`; when `data.calendar` is set, render `CalendarGrid` + the
  selected-day list in place of `sections`.

## Testing

- `calendar-marks.test.ts`: posted / off-budget / upcoming each set; a recurring row in an
  off-budget category → `◆` only; a refund-only day; `resolveSelectedDay` in-cycle, out-of-cycle,
  past cycle.
- `heatmap.test.ts`: updated to the map input; a negative day → intensity 0.
- `use-records.test.ts` (`renderHook`): `view=calendar` returns cells/marks/selectedDay/dayEntries;
  a past cycle has no upcoming bills; a category filter narrows both entries and bills; `spanAll`
  falls back to `date`.
- `use-analytics.test.ts`: a recurring and an off-budget row no longer darken their day.
- `CalendarGrid.test.tsx`: spans vs links, `aria-current`, the aria-label words, and the legend lists only the
  kinds present.
- Contrast: an assertion that every intensity level's ink (0–4) against its background meets 4.5:1 in
  both themes, using the resolved token values the same way `globals.test.ts` does.
- **Browser at 412px, both themes:** grid legibility; tap day → list; edit a row → back lands on
  the same `?day=`; swipe-delete + Undo refresh the marks; a cycle step drops `?day=`; Trends card is
  still non-interactive.

## Out of scope

Calendar-month (1st–31st) mode; a baht figure inside cells; tap-through on the Trends grid;
marking a hand-paid bill as fixed (the known `isFixed` ceiling).
