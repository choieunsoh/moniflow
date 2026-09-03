# Truth and trust: make every figure on screen literally true

Date: 2026-09-03
Branch: `fix/truth-and-trust`
Status: approved, ready for planning

## Why

A prom-design review of all 16 mobile routes (driven at 390x844 against the real
ledger) found that several figures on screen are either wrong or described by a
label that does not match them. This is the first of four slices because every
other visual judgement rests on whether the numbers are believable: a donut whose
slices add up to 109% discredits the rest of the page, however well it is styled.

Three findings from that review were corrected while reading the source, and the
corrections are recorded here so nobody re-litigates them:

1. The `No note` row in Top notes is deliberate (`by-note.ts`): blank notes
   collapse into one bucket rather than littering the list. Removing it would
   hide money. Only its presentation is wrong.
2. The `/accounts` heading does not lie about its numbers. The page holds two
   datasets: a donut fed by `breakdown` (this cycle's spending) and a list fed by
   `counts` (all-time usage). The heading describes the donut; the list changes
   subject with nothing marking the change.
3. The 109% donut was already known. `donut.ts` carries a `ponytail:` comment
   describing it and naming the upgrade path: "the visible wedges can also add up
   to more than the figure printed beside them. Give the ring a signed centre
   figure if that ever misleads." This slice takes that path.

## Scope

In scope: the seven items below. No schema change, no OPFS column migration, no
change to the backup CSV format, no new dependency.

Out of scope, each its own later slice: palette and colour grammar (B), density
and compaction (C), layout, truncation and the dash sweep (D).

## Decisions taken

Recorded because they were product calls, not derivable from the code:

- **Refunds in the donut**: percentages divide by the sum of the drawn slices, so
  they always total 100%. A category that netted to zero or below is not in the
  ring (that filter already exists). A footnote names the money the ring could
  not draw, so it is never silently missing.
- **The headline**: lead with gross spend, which can never be negative and agrees
  with the ring below it. Refund and net get their own quiet lines.
- **Card shape**: split into a gross block and a budget block. Each figure then
  has exactly one frame. This resolves a collision the first draft missed:
  `11,226 of 38,375` double-counts, because the 38,375 ceiling is
  `50,000 budget - 11,625 fixed` and the 11,226 gross is itself entirely fixed
  cost. Measuring that money against a ceiling it has already left would read as
  "29% of budget used" when the true discretionary figure is zero.

## The eight changes

### 1. Donut percentages total 100%

Files: `features/entries/donut.ts`, `features/entries/ui/LegendRow.tsx`,
`app/page.tsx`.

`LegendRow.tsx:36` computes `share = slice.value / total`, where `total` is
use-home's net signed total. The slices are magnitudes and already filtered to
`value > 0`, so the numerator and the denominator come from different sets.

Change: `toDonutSlices` also returns the sum of the values it drew. `page.tsx`
passes that sum to `LegendRow` as `total`. Nothing else moves.

Tests: a cycle containing a refund produces shares summing to exactly 100; a
cycle with no refund is unchanged from today's output.

### 2. A footnote for money the ring could not draw

Files: `app/page.tsx`, and the same treatment for the `/accounts` donut.

Below the legend, when the drawn sum differs from the cycle's net total, render a
muted line naming the difference and its category, for example
`฿888 refunded (เกมส์), not shown in the ring`. When the two agree, render
nothing, so an ordinary cycle gains no extra chrome.

Tests: rendered when a refund exists; absent when none does; names the refunding
category.

### 3. The donut centre carries the ring's own total

File: `features/entries/donut.ts`.

The hole currently shows the transaction count, on the documented reasoning that
the panel above already carries the total. That reasoning stops holding under
item 1: the panel above now shows gross-with-a-different-frame, so the ring's own
total exists nowhere else. The centre becomes that total.

The `ponytail:` comment is rewritten rather than deleted: it should now record
that the centre is the ring's own sum and why, so the next reader does not undo
this.

Tests: the centre string is the drawn sum, formatted with the same money
formatter the legend uses.

### 4. The Home headline splits into two blocks

File: `app/page.tsx`.

```
Spent this cycle          ฿11,226      gross, agrees with the ring
฿888 refunded · net ฿10,338
all of it fixed cost

Left to spend        ฿0 of ฿38,375     the only denominator on the card
[meter]
55% under pace
```

The refund line renders only when a refund exists. The fixed-cost line keeps its
current conditional. The existing comment in `page.tsx` about the headline and
the meter needing to agree on what "spent" means is rewritten: they now agree by
being separate, each true in one frame.

Tests: with refunds, gross is shown and is positive; the budget block's numerator
is the discretionary figure, not the gross one; a cycle with neither refunds nor
fixed cost renders neither extra line.

### 5. `/budgets` never prints a negative "spent"

File: `app/budgets/page.tsx`.

`-฿888.00 spent` becomes `฿888 refunded`. Same rule as Home: the word "spent"
never precedes a negative number. Applies to both the total row and the
per-category rows.

Tests: a category whose refunds exceed its spend renders the refunded wording; a
normal category is unchanged.

### 6. `/accounts` marks its change of subject

File: `app/accounts/page.tsx`.

The page heading keeps describing the donut. The list below gets its own heading
naming what its numbers are, `All accounts · times used`, so a reader cannot
carry "spending" down from the heading onto a usage count.

Tests: the list heading is present and names the unit.

### 7. Number columns carry their unit

Files: `app/categories/page.tsx`, `app/accounts/page.tsx`.

Both render `countFmt.format(c.count)` with nothing saying what the number counts.
On a screen otherwise full of baht, a bare `2,162` reads as money. Add the unit.

The count in `/categories` is already a tap target into filtered records; that
affordance is kept exactly as it is.

Tests: the rendered row includes the unit alongside the number.

### 8. "No note" reads as a residual, not a merchant

File: the consumers of `features/entries/by-note.ts`.

Keep the bucket (removing it would hide money). Render it muted as `(no note)`
and sort it last regardless of size, so a list of merchant names never appears to
contain a merchant called "No note".

`by-note.ts` itself keeps returning the bucket in value order; the sort-last rule
belongs to the presentation, so the pure function stays sorted by value and
testable as it is today.

Tests: the bucket renders with the residual wording; it is last even when its
total is the largest.

## Testing approach

TDD per the project rules: failing test first, then implementation. The pure
modules (`donut.ts`, `by-note.ts`) get unit tests; the pages and `LegendRow` get
render tests, following the 22 existing `*.test.tsx` files rather than inventing
a new harness.

Tests alone are not sufficient here. The review that produced this document found
these defects against a green suite, because they live in what the browser
composited, not in what the functions returned. So the slice is not done until it
has been driven at 390px against the real ledger and the Home donut has been
observed summing to 100%.

## Done means

- Percentages on Home and `/accounts` sum to 100% on a cycle containing a refund.
- No screen prints "spent" followed by a negative number.
- Every number column on `/categories` and `/accounts` says what it counts.
- `(no note)` reads as a residual and sorts last.
- `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm test` all
  pass, run separately.
- Verified in a browser at 390px against the real ledger, not only in tests.

## Risks

- **The donut centre change contradicts a documented decision.** Mitigated by
  rewriting the comment to record the new reasoning, so the change is not
  silently reverted later.
- **The Home card grows by roughly one line.** Home measured 2.29 screens, inside
  the density budget, so it can absorb it. If it cannot, slice C is where density
  gets addressed, not here.
- **`use-home` feeds several surfaces.** Changing what it returns risks a
  consumer this slice did not look at. The review that produced this document
  found exactly that class of bug (a change swept producers thoroughly and
  consumers selectively), so every consumer of a changed value gets checked
  before the slice is called done.
