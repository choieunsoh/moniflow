# Analytics trend repair — design

Date: 2026-07-17
Status: approved, pending implementation plan
Supersedes: the budget-line sections of `2026-07-17-analytics-design.md` (see "What this reverses")

## Problem

`/analytics` shipped this morning and a design critique scored it **20/40** with one P0 and three P1s.
The deterministic slop detector found nothing across every file; the failures are semantic, not
stylistic. Four of them share a root: the page makes claims it does not honour.

1. **The header total filters; the list beneath it does not.** (P0)
2. **The budget line squashes the chart it is meant to inform.** (P1)
3. **The chart is unreachable by keyboard or screen reader.** (P1)
4. **There is no empty state, and the subtitle asserts history the user may not have.** (P1)

### 1. The filtered breakdown does not filter

`use-analytics.ts:100-101`:

```ts
const bars = toTrendBars(cycles, spendByCycle, currentKey);   // category-filtered
const slices = toDonutSlices(aggregate(breakdowns));          // NOT filtered
```

`total` derives from `spendByCycle`, which reads `category` (lines 92-96). `slices` comes from
`aggregate(breakdowns)`, which never reads `category` at all. So with `?category=Food` the h2 says
Food, the total says Food's six-cycle total, the chart plots Food's trend — and the list underneath
shows every category.

The page's own doc comment (`analytics/page.tsx:17`) states `?category=` "narrows the trend **and
breakdown** to one category." The code does not do that.

A user drilling into Food sees ฿8,400 over a list summing to ฿52,000 and must decide which number to
distrust. On a spending tracker whose brand words are **steady, precise, honest**, a surface that
contradicts itself is worse than one that is plain. It survived review because the dev ledger holds
exactly one category, which makes the filtered and unfiltered lists identical.

### 2. The budget line destroys the trend — and the spec already knew

Measured at 412px with real data (฿4,899 across one category, ฿30,000 total budget):

- **Unfiltered:** `yAxis.max` pins to ฿30,000, so the bar renders at **~16% height**, five empty
  months beside it, ~70% of the plot dead space.
- **Filtered:** no category budget exists, so the line drops, the axis rescales, and the **same bar**
  fills the plot.

The two views are not visually comparable. The page exists to answer "is this normal for me", which
means reading the *shape* — and the shape degrades precisely when you are comfortably under budget,
the moment you least need a warning and most deserve reassurance.

**The prior spec killed an entire view for this exact bug.** From "The budgets view, and why it went",
reason 2:

> The bars were unreadable. They scaled to the limit, so ฿4,899 against a ฿30,000 limit rendered ~5px
> in a 32px strip and the unspent cycles sat at the 2px floor. Six dashes. Being *under* budget made
> the data vanish — backwards.

And from "The budget reference line", four sections earlier:

> The accepted cost of that: the further under budget you are, the shorter every bar gets (฿4,899
> against a ฿30,000 line fills 16% of the height). That is the same mechanism, not a separate
> problem — and short bars under a distant line are a fair rendering of "well under budget".

Same mechanism, same ฿4,899-against-฿30,000 example, opposite verdicts, one document. The second
passage even names it "the same mechanism" while accepting it. The budgets view was deleted for the
crime the trend chart was pardoned for.

This is not a new objection. It is the prior spec's own reasoning, applied consistently.

### 3. The chart is a dead end for assistive technology

`TrendChart.tsx:50` ships `role="img"` with `aria-label="Total spending over the last 6 cycles"` —
verified in the live DOM. That sentence carries **no values, no reference, no direction**. Bars are
canvas. The tooltip is `trigger: 'item'` — pointer-only, unreachable by keyboard. The category list
gives window totals but never a per-cycle figure.

A screen-reader user learns a chart exists and nothing else. Every number the page exists to
communicate is unreachable — and the data is already in scope (`bars` carries `{label, value,
partial}`).

This also fails sighted users: per-cycle figures are locked behind a tap on a 32px-wide bar, with
nothing signalling that bars are tappable.

### 4. No empty state; the subtitle asserts history that may not exist

`lastCycles` returns `n` cycles unconditionally. `toDonutSlices` filters `value > 0`, so a fresh
ledger yields `slices = []`. Day one renders: "All spending / Last 6 cycles / ฿0", six month labels,
no bars, an empty list. With one cycle of history it is worse in a specific way — the only real bar
is the `partial` one at `opacity: 0.45`, so the user's sole data point is the faintest ink on screen.

Home handles this with `EmptyLedger`, which teaches the interface (points at the FAB, offers the CSV
restore). Analytics inherits none of it.

This matters twice over: moniflow is the reference implementation for the `create-sqlite-next-app`
scaffold, so a **developer's first sight of Analytics is with an empty ledger**. PRODUCT.md requires
the UI read as "a confident, finished default, not a placeholder to rip out."

## Goals

- The header total and the list beneath it always describe the same thing.
- A reference line that answers "is this normal for me" without distorting the chart.
- Every figure in the trend reachable by keyboard and screen reader.
- A first-run Analytics screen that is honest about having no history yet.
- Net **less** code than today.

## Non-goals

- **Rebuilding the budgets view.** The prior spec's three reasons stand. Nothing here revisits them.
- **Removing Budgets as a feature.** `/budgets` and `BudgetMeter` are untouched. Analytics simply
  stops reading budget rows.
- **Recolouring bars above the average.** The line carries the signal; colouring is a second feature,
  and the prior spec's ruling on this for the budget line applies unchanged.
- **A range picker, stacked composition, forecasting, income.** All still out, per the prior spec.
- **Merging Home and Analytics.** The critique raised it; out of scope here.

## What this reverses

From `2026-07-17-analytics-design.md`:

| Prior decision | Now |
| --- | --- |
| "Budget comparison — the trend's dashed line, against current limits" | Reversed. Analytics shows no budgets. |
| "Budget line — dashed line on the trend chart only; follows the filter; forces `yAxis.max`" | Reversed. Replaced by a six-cycle average; no axis forcing. |
| Goal: "Answer whether the budgets you have set now actually fit how you spend" | Dropped. `/budgets` owns budgets. |
| "The budget reference line" section (incl. the accepted bar-shortening) | Superseded by "The average line" below. |

That spec's Decisions table and "The budget reference line" section must be amended to point here,
rather than left contradicting the code. The "budgets view, and why it went" section **stays** — its
reasoning is now what justifies this change.

The prior spec's non-goal "Budget history / compliance records" survives on its own terms and is in
fact strengthened: with no budget line, analytics makes no budget claim at all.

## Decisions

| Decision | Choice |
| --- | --- |
| Reference line | Your own average across the window, not a budget |
| Average basis | Complete cycles with spend only — excludes the live cycle and zero cycles |
| Zero handling | `value > 0` treats a zero cycle as "not tracking yet" (see the ceiling below) |
| Thin history | Fewer than 2 qualifying cycles → no line, and the subtitle says why |
| Where it is computed | Derived from `bars` inside `trend.ts` — not threaded through the hook |
| `yAxis.max` | Deleted. An average is always inside the data's range and cannot clip. |
| Filtered list | Becomes a per-cycle breakdown of the filtered category |
| Unfiltered list | Unchanged — the window's category composition |
| Budgets in analytics | None. `use-analytics` drops its `getBudgets` import. |
| a11y | Data-derived `aria-label` + a visually-hidden table, unfiltered only |
| Empty ledger | Reuse `EmptyLedger`; do not build a second empty state |

## The average line

### Why an average and not a fixed budget

Swapping budget → average changes the chart from **normative** ("are you obeying a rule you set?") to
**descriptive** ("is this typical for you?"). Three problems dissolve rather than get fixed:

- **The axis bug disappears by construction.** An average is always within the data's range, so it can
  never fall above the tallest bar. `yAxis.max` — and the clipping hazard it existed to prevent — both
  go away. The bug was never really in `yAxis.max`; it was in choosing a reference that lives outside
  the data.
- **The referent switch disappears.** A budget line means two different things filtered vs unfiltered
  (total cap vs category cap) with identical rendering. An average means the same thing in both
  states: the mean of the bars you are looking at.
- **The legend requirement disappears.** The page's subtitle is already about the window; "your
  average" needs no explanation the page does not already give.

It also matches the page's stated purpose. `analytics/page.tsx:13-14`: *"Home answers 'what did I
spend this cycle'; this answers 'is that normal for me'."* Normal **for me** is an average, not a cap.

### The basis: complete cycles with spend

```ts
// Complete cycles only, and only ones with spend. A zero cycle is a real zero in the BARS
// (you spent nothing) — but as an average basis it is almost always "not tracking yet", and
// averaging those in drags the line low enough to call every real cycle above-normal.
// The live cycle is excluded for the same reason its bar is faded: it is not finished.
export function completeBars(bars: TrendBar[]): TrendBar[];

// null when fewer than 2 complete bars: one cycle has no "normal" to compare against, and a
// line sitting exactly on the only bar is noise.
export function trendAverage(bars: TrendBar[]): number | null;
```

Two exclusions, each for a reason the codebase already accepts:

- **The live cycle.** `toTrendBars` fades it because "it is still filling up, so the chart must not
  present it as comparable to the finished ones" (`trend.ts:17-19`). An average is a comparison. On
  day 2 of July you have spent ฿400 of a typical ฿5,000; include it and the line sags for the rest of
  the month. This is the same lie the prior spec caught in the deleted view's "6 of 6 cycles would
  have held" headline — the live cycle counted as if complete.
- **Zero cycles.** If your ledger starts in May and the window covers Feb–Jul, four bars are zeros
  meaning "no data", not "spent nothing". Averaging them in halves the line, which then reports every
  real cycle as above-normal.

`toTrendBars` deliberately collapses the no-data/no-spend distinction (`trend.ts:23`: "A cycle with no
spend is a real zero (you spent nothing), not a gap"). That is right for bars — a gap reads as a
rendering bug. The average needs a distinction the bars discarded, so it is recovered with `value > 0`.

**The ceiling, recorded honestly:** `value > 0` cannot tell a genuine zero-spend complete cycle from a
pre-tracking one, and excludes both. In a single-user spending tracker a real zero-spend month means
you did not open the app, so excluding it is the safer error — but it is an error, and it nudges the
average up. The upgrade path is a `min(date)` query against `entries`; the implementation carries a
`ponytail:` comment naming exactly this.

### Rendering

- Label: `Average ฿4,200` — the word is present, in both filtered and unfiltered states. The prior
  line's bare `฿30,000` could have been a budget, a target, a mean, or last year.
- The line keeps the dashed 1px treatment, which satisfies meaning-not-by-colour-alone.
- **The line does not share ink with the bars.** Today the markLine is `p.muted`, which is also every
  non-anchor bar's colour. It moves to `p.border` — a hairline weight distinct from data. If that
  fails 3:1 non-text contrast against `--color-surface`, it takes `p.text` at reduced opacity instead.
  Measure; do not assume.
- Bars above the average are **not** recoloured (see Non-goals).

### Thin history

Fewer than two qualifying cycles → no line, and the subtitle carries the reason:

> Come back next cycle to see whether this is typical

This is the honest answer. On day one, "is my spending normal for me?" genuinely has no answer, and
the current page pretends otherwise with six fabricated slots. Saying so is more trustworthy, more
on-brand, and less code than the empty state the page currently lacks.

### Why it is derived in `trend.ts`, not passed in

The average is definitionally a property of what is plotted. `bars` already carries `{value, partial}`
— everything the computation needs. Deriving it anywhere else creates a second source of truth that
can drift from the chart it describes.

So `buildTrendOption` **loses** its `limit` param and calls `trendAverage(bars)` internally. The page
calls the same exported helper for its subtitle. One definition, two readers, no threading.

This is a net deletion:

- `buildTrendOption` — drops the `limit` param, the `yAxis.max` computation, and its defending comment.
- `TrendChart` — drops the `limit` prop.
- `use-analytics` — drops the `getBudgets` import, `budgetRows`, `totalLimit`, the `limits` map,
  `budgetLine`, and `budgetLine` from the `AnalyticsData` type.
- `analytics/page.tsx` — drops `budgetLine` from its destructure.

## The filtered breakdown

The critique's framing question: **is the list a breakdown or a navigation control?** It is currently
rendered as a breakdown and behaves as navigation, which is exactly why the P0 was invisible.

Ruling: **it is a breakdown.** It sits directly beneath a total and is styled as that total's
decomposition, so it must decompose that total. Navigation is a side effect of a breakdown row, not
its purpose.

| State | The list shows | Row |
| --- | --- | --- |
| Unfiltered | The window's category composition (unchanged) | disc · name · (count) · amount → sets `?category=` |
| Filtered | That category's spend per cycle, oldest → newest | month · (count) · amount → `/records?cycle=<key>&category=<name>` |

The filtered rows carry no category disc: every row is the same category, so the marker would be six
identical discs conveying nothing. The month label reuses `monthLabel`, so the list and the x-axis
agree — including the start-month convention the prior spec pinned ("Why the labels stay").

This resolves four findings at once:

- **The P0.** The header total now sums the list beneath it.
- **Progressive disclosure.** Per-cycle figures escape the pointer-only tooltip and become readable
  text. The critique flagged this as a cognitive-load failure.
- **The self-filter no-op.** Today the active category still links to itself in the filtered state.
- **Half the a11y gap.** Filtered, the visible list *is* the accessible table.

### Data-layer change

The matrix in `use-analytics` currently stores magnitudes only. Per-cycle rows need counts too, so it
becomes `cycle key → category → { total, count }`. `getCategoryBreakdown` already returns `count` per
row — no new query, no new SQL, consistent with the prior spec's "add no schema change, no new
dependency, and no new SQL".

`AnalyticsData` gains `cycleRows: CycleRow[]` (empty when unfiltered), where
`CycleRow = { key: string; label: string; value: number; count: number }`.

## Accessibility

- **Data-derived chart label.** Built from `bars` where `formatBahtWhole` already is:
  `"Total spending over the last 6 cycles: Feb ฿4,100, Mar ฿3,880, … Jun ฿4,899 (cycle in progress).
  Average ฿4,200."` The `(cycle in progress)` clause gives non-visual users the information the 0.45
  opacity currently conveys visually-only.
- **A visually-hidden `<table>`** of cycle → amount as the chart's sibling — the standard canvas
  escape hatch, and it fixes keyboard users too. **Unfiltered only:** filtered, the visible per-cycle
  list already carries these figures, and a hidden duplicate would make screen readers read every
  number twice.
- **`role="status"`** on the loading placeholder, so the swap from `…` to a full report is announced.
- **An `<h1>`.** The app has none anywhere — `layout.tsx` has none, `Wordmark` is a plain `<span>`,
  and every page's top heading is an `<h2>`. Heading navigation starts at level 2 with no root.
  `Wordmark` becomes the `<h1>`, visually identical. This touches the shared shell rather than
  `/analytics`; it is included because it is a shell-wide defect found here, and fixing it in the
  shell is the smaller diff than leaving five pages rootless.

## Empty and thin states

| Condition | Render |
| --- | --- |
| `slices.length === 0` (no spend anywhere in the window) | `EmptyLedger` — reused, not rebuilt |
| Data present, `trendAverage === null` | Chart + list, no line, subtitle: "Come back next cycle to see whether this is typical" |
| Otherwise | Subtitle names the real window (`Feb – Jul 2026`) via `cycleFromKey(activeKey, cutoff)` |

The subtitle stops asserting "Last 6 cycles" unconditionally. It also fixes a separate critique
finding — the window's anchor is currently invisible, so arriving from Home with `?cycle=2026-03`
silently shows Oct–Mar while the page still says "Last 6 cycles".

## Minor repairs

Bundled because the critique found them and full scope was chosen. Each is independent.

| Fix | Why |
| --- | --- |
| `HeaderFilterChip` adds the existing `.tap` class | Measured **51.7 × 22px** — misses the house rule (DESIGN.md: "every touch target clears 44px") by half. `.tap` (`globals.css:186`) already does exactly this and is documented for "link-style controls that aren't `.btn`". `.chip` is already `inline-flex`, so they compose. **No CSS change.** |
| `HeaderFilterChip` gains an `×`, **only when `active`** | It is the only visible exit from `?category=` and reads as a label, not a control. Its `aria-label` is already correct, so screen-reader users are told and touch users are not — backwards for a touch surface. It must stay conditional: on Records the chip also renders **inactive** ("Filter by Food"), where an `×` would be a lie. |
| `min-w-0` on the chip's flex wrapper (`page.tsx:54`) | A flex item's default `min-width: auto` refuses to shrink, so `.chip truncate` likely never fires and a long category name can push past the panel edge. |
| `globals.css:9-10` mono comment | Still says "sans = UI, **mono = numbers**" though only `--font-sans` exists. It invites the next reader to restore the dotted zero that was deliberately removed. |
| `#1e2128` tooltip background → a `surface2` palette token | Hardcoded in `trend.ts:73` **and** `donut.ts:76`, bypassing the token system. Breaks the "swap one accent token to reskin" promise PRODUCT.md makes to scaffold users. |
| `TrendChart` → `setOption` over re-`init` | The effect depends on `[bars]`, a fresh array every run, so every `bumpDataVersion()` triggers a full `init`/`dispose`. |
| `PRODUCT.md` corrected | Describes Server Components reading SQLite directly, Budgets in the bottom nav, and no Analytics page. All three are false since the OPFS migration. |

### Two traps in `HeaderFilterChip` — do not fall into these

The critique this spec is built on got both of these wrong. They are recorded so the implementation
does not repeat them.

**1. Do not put `min-height` on `.chip`.** The critique claimed `.chip` is "used across 11 files" and
should be fixed at the class. It is used in **six** places, and only **two** are interactive:

| Usage | Interactive |
| --- | --- |
| `trips/page.tsx:72` — currency label | No — a `<span>` |
| `budgets/page.tsx:80` — cycle label | No — a `<span>` |
| `records/page.tsx:138` — currency label | No — a `<span>` |
| `RuleRow.tsx:182` — schedule label | No — a `<span>` |
| `SwipeRow.tsx:228` — tap-to-filter | **Yes** |
| `HeaderFilterChip.tsx:26` | **Yes** |

A blanket `.chip { min-height: 44px }` would inflate four decorative labels and wreck the dense
Records, Budgets, and Trips layouts — a fix worse than the bug. The correct change is to add the
existing `.tap` class to `HeaderFilterChip` alone.

`SwipeRow`'s chip is deliberately **left as-is**: it is a secondary affordance sitting beside a
full-row primary target in a dense ledger, where 44px would cost more than it buys. Note that WCAG
2.1 AA — the level PRODUCT.md commits to — has no target-size criterion at all; 44px is the project's
own stricter house rule, and the 24px minimum only arrives in WCAG 2.2's 2.5.8.

**2. `stopPropagation` is not dead — do not delete it.** The critique called it dead code. It is dead
*at the Analytics call site*, but `HeaderFilterChip` is shared, and `records/page.tsx:230` renders it
inside a collapsible `<summary>`, where the handler is what stops a filter tap from also toggling the
section. Its comment (`HeaderFilterChip.tsx:9-11`) explains exactly this. Removing it silently breaks
Records.

The component's doc comment should be widened to say it now serves two surfaces, so the next reader
does not draw the same wrong conclusion from a comment that names only Records.

### The h2/chip repetition, kept deliberately

Filtered, "Coffee" appears as the h2 and again as the chip beneath it. The critique proposed removing
the duplication. It stays: the h2 is the page's title and the chip is the applied filter with its
clear control — a standard, legible pairing once the `×` exists. The defect was never the repetition;
it was that the chip gave no sign it was a control. The `×` fixes that. Changing the chip's label to
something other than the filter it clears would also break its contract with Records.

## Testing

Per CLAUDE.md: failing test first, pure logic tested directly, hooks via `renderHook`.

**`trend.ts`** (pure, extends `trend.test.ts`):

- `completeBars` excludes the partial cycle; excludes zero-value cycles; keeps complete non-zero ones.
- `trendAverage` returns the mean of qualifying bars; `null` at 0 and at 1 qualifying bar; ignores the
  partial cycle even when it is the largest value; unaffected by leading zeros (the pre-tracking case).
- `buildTrendOption` draws the markLine when an average exists, omits it when `null`.
- **`yAxis` carries no `max`** — a regression guard. The old test asserting `max` reaches a limit
  above every bar is deleted with the feature it guarded; this replaces it.
- The label reads `Average ฿4,200`, not a bare figure.

**`use-analytics.ts`** (`renderHook`):

- `cycleRows` is empty when unfiltered; per-cycle for the filtered category, oldest → newest, with
  counts, when filtered.
- **The P0 regression guard:** filtered, `total` equals the sum of `cycleRows` values. This is the
  test that would have caught the bug — it asserts the header and the list agree.
- The existing `budgetLine` tests are deleted with the field.

**Fixtures must include a second category.** The dev ledger holds one, which is precisely why the P0
survived review — with one category the filtered and unfiltered lists are identical.

Tests run against the Node shim and prove the queries only. Per CLAUDE.md the work is not done until
driven in a real browser at 412px — with **at least two categories and a thin-history ledger**, since
those are the states the tests cannot see and the ones that broke.

## Files

| File | Change |
| --- | --- |
| `src/features/entries/trend.ts` | add `completeBars` + `trendAverage`; drop `limit` param, `yAxis.max`, budget markLine; `surface2` on the palette |
| `src/features/entries/trend.test.ts` | average + no-`max` regression guards; delete the budget-line tests |
| `src/features/entries/ui/TrendChart.tsx` | drop the `limit` prop; data-derived `aria-label`; hidden table (unfiltered); `setOption` over re-`init`; resolve `surface2` |
| `src/features/entries/use-analytics.ts` | drop `getBudgets`/`budgetLine`; matrix carries counts; derive `cycleRows` |
| `src/features/entries/use-analytics.test.ts` | `cycleRows` + the total/list agreement guard; delete `budgetLine` tests |
| `src/features/entries/donut.ts` | `#1e2128` → `surface2` token |
| `src/app/analytics/page.tsx` | filtered per-cycle list; `EmptyLedger`; real subtitle; `role="status"`; `min-w-0`; drop `budgetLine`; **fix the doc comment** |
| `src/features/entries/ui/HeaderFilterChip.tsx` | add `.tap`; add `×` when `active` |
| `src/app/globals.css` | delete the mono comment (no `.chip` change — see below) |
| `src/shared/ui/AppHeader.tsx` | `Wordmark` becomes the `<h1>` |
| `docs/superpowers/specs/2026-07-17-analytics-design.md` | amend the Decisions table + budget-line section to point here |
| `PRODUCT.md` | correct the stale architecture, nav, and surface list |

No schema change, no new dependency, no new SQL, no new query — consistent with the prior spec's
constraint. The net line count goes **down**.
