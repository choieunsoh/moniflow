# Truth and Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every figure on moniflow's mobile screens literally true: donut shares that total 100%, no "spent" followed by a negative number, and every number column saying what it counts.

**Architecture:** Eight small, independent changes. The only shared piece of new logic is one exported helper, `drawnTotal(slices)`, which replaces a denominator that came from a different dataset than its numerator. Everything else is presentation: labels, conditional lines, and sort order. No schema change, no OPFS migration, no backup-format change, no new dependency.

**Tech Stack:** Next.js 16 App Router (static export, every page `'use client'`), React 19, TypeScript 5.9 strict, Tailwind v4, ECharts 6, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-03-truth-and-trust-design.md`

**Branch:** `fix/truth-and-trust` (already created, spec already committed as `339a1e2`)

## Global Constraints

- TypeScript: no `any`, no `as` casts, no `!` assertions, no `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error`. Prefer `type` over `interface`. Prefer `for..of` over `.forEach`.
- No em dashes or en dashes in any code, comment, commit message, or user-facing string added by this plan.
- Money formatters by provenance: `formatBaht` for stored/computed figures (states satang), `formatBahtWhole` for glance figures. Do not introduce a third.
- Never add the `Claude-Session:` trailer to a commit message. `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` is correct and stays.
- Commit with repeated `-m` flags. Never `git commit -F <file>` and never a heredoc: the wrapped git on this machine receives no stdin and the commit-msg hook rejects the message as empty.
- Commit format `type(scope): description`, single-word scope from: `db`, `app`, `features`, `shared`.
- Before each commit run, separately: `npm run format:files <changed files>`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. All must pass.
- Run a single test file with `npm test -- <path>`.
- **There are no route-level test files in this repo.** Every one of the 22 `*.test.tsx` files targets a feature component (`src/features/*/ui/*.test.tsx`), never `src/app/*/page.tsx`. Do not invent a route-test harness for this slice: a `'use client'` route reads `useSearchParams` and its own `use-*` hook against OPFS, so testing one means mocking both, and that is a larger change than anything in this plan. Instead, follow the project's own rule that logic belongs in named components and plain modules: extract the unit, test the unit with the harness that already works, and let Task 9 cover the page-level composition in a real browser.

## Reference values from the real ledger

Used in the browser-verification task. Cycle 18 Aug to 17 Sep 2026:

- gross spend `฿11,226`, all of it fixed cost
- one refund, category `เกมส์`, `฿888`
- net `฿10,338`
- discretionary `-฿888`
- budget `฿50,000`, fixed reserve `฿11,625`, ceiling `฿38,375`
- donut today shows `52% + 50% + 7% = 109%`

---

### Task 1: One denominator for donut shares

The numerator is a slice magnitude (positive, refund-netted categories already filtered out by `toDonutSlices`). The denominator is `use-home`'s signed net total. Different sets, so the shares can exceed 100%. `donutSummaryLabel` already computes the correct sum inline; extract it so there is one definition.

**Files:**
- Modify: `src/features/entries/donut.ts` (add export, reuse it in `donutSummaryLabel`)
- Modify: `src/app/page.tsx` (pass the new denominator to `LegendRow`)
- Test: `src/features/entries/donut.test.ts`

**Interfaces:**
- Consumes: `DonutSlice` (existing, exported from `donut.ts`), `toDonutSlices` (existing).
- Produces: `drawnTotal(slices: DonutSlice[]): number` exported from `src/features/entries/donut.ts`. Tasks 2 and 3 both call it.

- [ ] **Step 1: Write the failing test**

Append to `src/features/entries/donut.test.ts`:

```ts
describe('drawnTotal', () => {
  it('sums the values the ring actually drew', () => {
    const slices = toDonutSlices([row('a', -30, 5), row('b', -20, 2)]);
    expect(drawnTotal(slices)).toBe(50);
  });

  it('excludes a category whose refunds outweighed its spend, so shares can total 100', () => {
    // 'c' netted positive (a refund), so toDonutSlices drops it. The denominator must drop it
    // too: dividing a drawn magnitude by the signed net is what produced 109% on Home.
    const slices = toDonutSlices([row('a', -30, 5), row('b', -20, 2), row('c', 8, 1)]);
    const net = -(-30 + -20 + 8);
    expect(drawnTotal(slices)).toBe(50);
    expect(drawnTotal(slices)).not.toBe(net);
    const shares = slices.map((s) => Math.round((s.value / drawnTotal(slices)) * 100));
    expect(shares.reduce((sum, s) => sum + s, 0)).toBe(100);
  });

  it('counts the Other bucket, which is drawn like any other wedge', () => {
    const rows = Array.from({ length: MAX_SLICES + 2 }, (_, i) => row(`c${i}`, -10, 1));
    expect(drawnTotal(toDonutSlices(rows))).toBe((MAX_SLICES + 2) * 10);
  });

  it('is zero for an empty ring', () => {
    expect(drawnTotal([])).toBe(0);
  });
});
```

Update the import line at the top of the same file:

```ts
import {
  toDonutSlices,
  buildDonutOption,
  donutSummaryLabel,
  drawnTotal,
  SLICE_COLORS,
  MAX_SLICES,
} from './donut';
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/features/entries/donut.test.ts`
Expected: FAIL. Vitest reports that `drawnTotal` is not exported from `./donut`.

- [ ] **Step 3: Add the helper and reuse it**

In `src/features/entries/donut.ts`, add after `toDonutSlices`:

```ts
// What the ring actually drew, and therefore the only honest denominator for a slice's share.
// The slices are magnitudes filtered to value > 0; the cycle's own total is a SIGNED net that
// still carries refunds. Dividing one by the other is what printed 52 + 50 + 7 = 109% on Home.
export function drawnTotal(slices: DonutSlice[]): number {
  return slices.reduce((sum, s) => sum + s.value, 0);
}
```

In the same file, change `donutSummaryLabel` to use it instead of its inline copy:

```ts
  const total = drawnTotal(slices);
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/features/entries/donut.test.ts`
Expected: PASS, including the pre-existing `donutSummaryLabel` cases (the extraction is behaviour-preserving).

- [ ] **Step 5: Use the helper as the legend's denominator**

In `src/app/page.tsx`, add `drawnTotal` to the donut import:

```ts
import { DonutChart } from '@features/entries/ui/DonutChart';
import { drawnTotal } from '@features/entries/donut';
```

Immediately after the existing `const folded = ...` line, add:

```ts
  // The ring's own sum. Shares divide by this, never by `total`: `total` is the signed net and
  // still carries refunds, while every drawn slice is a positive magnitude, so the two disagree
  // by exactly the refunded amount and the shares overshoot 100%.
  const grossSpend = drawnTotal(slices);
```

Then replace `total={total}` with `total={grossSpend}` in BOTH `LegendRow` usages in this file: the main `slices.map(...)` list and the `folded.map(...)` list inside the `<details>`. The folded rows must use the same denominator or Other's share stops equalling the sum of its parts.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. If a Home render test asserted a specific percentage string, update that expectation: the new value is correct and the old one was the bug.

- [ ] **Step 7: Quality gates**

```bash
npm run format:files src/features/entries/donut.ts src/features/entries/donut.test.ts src/app/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/features/entries/donut.ts src/features/entries/donut.test.ts src/app/page.tsx
git commit -m "fix(features): divide donut shares by what the ring drew" -m "Slice magnitudes are filtered to value > 0, but the share denominator was use-home's signed net total, which still carries refunds. On a cycle with a refund the two sets disagreed by exactly the refunded amount and the legend printed 52 + 50 + 7 = 109%." -m "donutSummaryLabel already computed the drawn sum inline, so this extracts that as drawnTotal() and gives both callers one definition. The folded rows inside Other use it too, or Other's share stops equalling the sum of its parts."
```

---

### Task 2: The donut hole carries the ring's own total

The hole shows a transaction count today, on the documented reasoning that the panel above already carries the money. Task 1 breaks that premise: the panel's figure is now a different frame from the ring's, so the ring's total exists nowhere else on the screen.

**Files:**
- Modify: `src/features/entries/donut.ts` (`buildDonutOption`, the `COUNT_REM` comment block)
- Test: `src/features/entries/donut.test.ts`

**Interfaces:**
- Consumes: `drawnTotal` from Task 1.
- Produces: nothing new. `buildDonutOption(rows, palette)` keeps its signature.

- [ ] **Step 1: Write the failing test**

Append to `src/features/entries/donut.test.ts`:

```ts
describe('buildDonutOption hole', () => {
  const palette = {
    text: '#fff',
    muted: '#999',
    surface: '#111',
    font: 'system-ui',
    rootPx: 16,
  };

  it('names the ring total, the one figure the panel above no longer carries', () => {
    const option = buildDonutOption([row('a', -30, 5), row('b', -20, 2)], palette);
    expect(option.graphic[0].style.text).toBe(formatBahtWhole(50));
    expect(option.graphic[1].style.text).toBe('spent');
  });

  it('excludes a refunded category from the hole, matching the wedges', () => {
    const option = buildDonutOption([row('a', -30, 5), row('c', 8, 1)], palette);
    expect(option.graphic[0].style.text).toBe(formatBahtWhole(30));
  });
});
```

Add `formatBahtWhole` to that file's imports:

```ts
import { formatBahtWhole } from '@shared/money';
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/features/entries/donut.test.ts`
Expected: FAIL. Received is the formatted count (`"7"`) and the label `"transactions"`, not `฿50` and `"spent"`.

- [ ] **Step 3: Change the hole's content**

In `src/features/entries/donut.ts`, inside `buildDonutOption`, replace the three `count` lines:

```ts
  const slices = toDonutSlices(rows);
  const total = drawnTotal(slices);
  const totalText = formatBahtWhole(total);
  const totalLabel = 'spent';
```

Then use `totalText` where `countText` was used and `totalLabel` where `countLabel` was used, in the two `graphic` entries. Leave `COUNT_REM`, `LABEL_REM`, the `fill: p.muted` values and the `top` percentages untouched: the hole stays a quiet annotation, only its content changes.

- [ ] **Step 4: Rewrite the two comments that now describe the old behaviour**

Replace the `COUNT_REM` block comment with:

```ts
// The hole's two lines, as multiples of the root font-size (1.125rem / 0.8125rem at the 16px
// default). Deliberately quieter than the .text-xl figure in the panel above: the two now answer
// DIFFERENT questions (the panel leads with the cycle's gross against its budget, the hole names
// what this ring drew), so the hole is an annotation on the ring rather than the page's answer.
// It is not a duplicate of the panel any more, which is why it may carry money at all.
```

Replace the paragraph above `buildDonutOption` beginning "The hole deliberately does not carry the money" with:

```ts
// The hole carries the ring's own sum. It used to carry the transaction count, because the panel
// above printed the identical money figure and the ring was the copy rather than the original.
// That stopped being true when shares moved onto drawnTotal(): the panel now leads with gross
// spend against the budget ceiling, a different frame from this ring, so the ring's total exists
// nowhere else on the screen. If the panel is ever changed back to print this same figure, put
// the count back here rather than printing one number twice.
```

Also update the stale sentence in the `donutSummaryLabel` comment, "the hole drops the money to avoid printing it twice", to:

```ts
// intentionally says MORE than the hole draws: the hole names the money, and this adds the
// transaction count, because an image description is read in isolation.
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/features/entries/donut.test.ts`
Expected: PASS.

- [ ] **Step 6: Quality gates and commit**

```bash
npm run format:files src/features/entries/donut.ts src/features/entries/donut.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/donut.ts src/features/entries/donut.test.ts
git commit -m "fix(features): put the ring total in the donut hole" -m "The hole showed a transaction count because the panel above printed the same money figure and a ring is the copy, not the original. Dividing shares by drawnTotal() ended that: the panel leads with gross against the budget ceiling, a different frame from the ring, so the ring's own sum was left with nowhere to appear." -m "Both comments that recorded the old reasoning are rewritten rather than deleted, including the condition under which the count should come back."
```

---

### Task 3: Name the money the ring could not draw

`toDonutSlices` drops a category whose refunds outweighed its spend. That is correct for a ring (no negative wedge exists) but it makes money silently vanish from the surface. Name it instead.

**Files:**
- Create: `src/features/entries/ui/RingFootnote.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/accounts/page.tsx`
- Test: `src/features/entries/ui/RingFootnote.test.tsx`

**Interfaces:**
- Consumes: `formatBahtWhole` from `@shared/money`.
- Produces: `RingFootnote({ refunded, categories }: { refunded: number; categories: string[] })`, a React component returning `null` when `refunded <= 0`. Task 4 does not use it; `/accounts` in this task does.

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/ui/RingFootnote.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RingFootnote } from './RingFootnote';

describe('RingFootnote', () => {
  it('names the refunded amount and its category', () => {
    render(<RingFootnote refunded={888} categories={['เกมส์']} />);
    expect(screen.getByText(/฿888/)).toBeInTheDocument();
    expect(screen.getByText(/เกมส์/)).toBeInTheDocument();
    expect(screen.getByText(/not shown in the ring/)).toBeInTheDocument();
  });

  it('lists every refunded category', () => {
    render(<RingFootnote refunded={900} categories={['เกมส์', 'Grab Food']} />);
    expect(screen.getByText(/เกมส์, Grab Food/)).toBeInTheDocument();
  });

  it('renders nothing when there is no refund, so an ordinary cycle gains no chrome', () => {
    const { container } = render(<RingFootnote refunded={0} categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a negative difference rather than printing a negative refund', () => {
    const { container } = render(<RingFootnote refunded={-5} categories={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/features/entries/ui/RingFootnote.test.tsx`
Expected: FAIL, cannot resolve `./RingFootnote`.

- [ ] **Step 3: Write the component**

Create `src/features/entries/ui/RingFootnote.tsx`:

```tsx
import { formatBahtWhole } from '@shared/money';

// A ring cannot draw a negative wedge, so toDonutSlices drops a category whose refunds outweighed
// its spend. Dropping it is right; dropping it SILENTLY is not, because the difference between the
// ring's total and the cycle's net is then money that moved and is named nowhere. This is the one
// line that keeps the ring honest, and it renders only when there is something to disclose.
export function RingFootnote({ refunded, categories }: { refunded: number; categories: string[] }) {
  if (refunded <= 0) return null;
  const named = categories.length > 0 ? ` (${categories.join(', ')})` : '';
  return (
    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
      {formatBahtWhole(refunded)} refunded{named}, not shown in the ring
    </p>
  );
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/features/entries/ui/RingFootnote.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount it on Home**

In `src/app/page.tsx`, import it:

```ts
import { RingFootnote } from '@features/entries/ui/RingFootnote';
```

Below the `grossSpend` line added in Task 1, add:

```ts
  // The ring drew gross magnitudes; `total` is the signed net. The gap between them IS the refund,
  // and these are the categories it came from (a stored amount is negative for an expense, so a
  // category netting positive is one that handed money back).
  const refunded = grossSpend - total;
  const refundedCategories = categoryBreakdown.filter((r) => r.total > 0).map((r) => r.key);
```

Render it directly after the `<ul>` of `LegendRow`s inside the chart branch, before the `folded` `<details>`:

```tsx
<RingFootnote refunded={refunded} categories={refundedCategories} />
```

- [ ] **Step 6: Mount it on /accounts**

In `src/app/accounts/page.tsx`, import it:

```ts
import { RingFootnote } from '@features/entries/ui/RingFootnote';
```

The list there already filters `bars.filter((b) => b.pct > 0)` for the same reason. Directly after that `</ul>`, add:

```tsx
<RingFootnote
  refunded={bars.filter((b) => b.pct <= 0).reduce((sum, b) => sum + b.total, 0)}
  categories={bars.filter((b) => b.pct <= 0).map((b) => b.key)}
/>
```

A dropped account has `total > 0` (a stored refund is positive), so the sum is already positive and needs no negation.

- [ ] **Step 7: Quality gates and commit**

```bash
npm run format:files src/features/entries/ui/RingFootnote.tsx src/features/entries/ui/RingFootnote.test.tsx src/app/page.tsx src/app/accounts/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/RingFootnote.tsx src/features/entries/ui/RingFootnote.test.tsx src/app/page.tsx src/app/accounts/page.tsx
git commit -m "feat(features): name the money the donut could not draw" -m "toDonutSlices drops a category whose refunds outweighed its spend, because a ring has no negative wedge. Correct, but it left the gap between the ring's total and the cycle's net as money that moved and was named nowhere on the screen." -m "One muted line, rendered only when there is a refund to disclose, so an ordinary cycle gains no extra chrome. Mounted on Home and on /accounts, whose list already folded at the same point for the same reason."
```

---

### Task 4: Split the Home headline into a gross block and a budget block

`Spent this cycle  -฿888 of ฿38,375` puts two frames on one line. `฿38,375` is `฿50,000 budget - ฿11,625 fixed`, a ceiling fixed cost has already left; `-฿888` is discretionary. Leading with gross against that ceiling would double-count, so the two get separate blocks.

The card is currently inline JSX in a 294-line route file. Extract it into a component first: that is the project's own rule (logic belongs in named components, not inline), it gets the change under the render-test harness that already works, and it shrinks the route file. The extraction is what makes this task testable at all, since no route test harness exists.

**Files:**
- Create: `src/features/entries/ui/CycleTotals.tsx`
- Create: `src/features/entries/ui/CycleTotals.test.tsx`
- Modify: `src/app/page.tsx` (replace the inline `<section className="panel -mt-3 ...">` block with the component)

**Interfaces:**
- Consumes: `formatBahtWhole` from `@shared/money`, `BudgetMeter` from `@features/budgets/ui/BudgetMeter`, `pacePhrase` from `@features/budgets/budget-status`, and the `totalStatus` type already returned by `useHome`.
- Produces: `CycleTotals(props)` where props are `{ grossSpend: number; refunded: number; net: number; offBudgetTotal: number; fixedPosted: number; discretionarySpend: number; totalStatus: BudgetStatus | null; pacePct: number | undefined; showPace: boolean }`. Nothing later consumes it.

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/ui/CycleTotals.test.tsx`, following the structure of `src/features/entries/ui/TopNotesList.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycleTotals } from './CycleTotals';

// The real ledger's shape for cycle 18 Aug to 17 Sep 2026: 11,226 gross, all of it fixed cost,
// one 888 refund, so discretionary is -888. The old card printed "Spent this cycle -฿888 of
// ฿38,375", which was two frames on one line.
const refundCycle = {
  grossSpend: 11226,
  refunded: 888,
  net: 10338,
  offBudgetTotal: 0,
  fixedPosted: 11226,
  discretionarySpend: -888,
  totalStatus: { limit: 38375, spent: -888, pct: 0, state: 'under' as const },
  pacePct: 55,
  showPace: true,
};

describe('CycleTotals', () => {
  it('leads with gross spend and never prints "spent" before a minus sign', () => {
    render(<CycleTotals {...refundCycle} />);
    expect(screen.getByText('Spent this cycle').closest('div')).toHaveTextContent('฿11,226');
    expect(screen.queryByText(/-฿888/)).not.toBeInTheDocument();
  });

  it('names the refund and the net beneath the gross figure', () => {
    render(<CycleTotals {...refundCycle} />);
    expect(screen.getByText(/฿888 refunded · net ฿10,338/)).toBeInTheDocument();
  });

  it('keeps the only denominator on the budget block', () => {
    render(<CycleTotals {...refundCycle} />);
    const budget = screen.getByText('Left to spend').closest('div');
    expect(budget).toHaveTextContent('฿38,375');
    // Gross must never be measured against the ceiling: the ceiling is 50,000 budget minus
    // 11,625 fixed, and this gross IS that fixed cost, so it would read as 29% used when the
    // true discretionary figure is zero.
    expect(budget).not.toHaveTextContent('฿11,226');
  });

  it('omits the refund line on a cycle with no refunds', () => {
    render(<CycleTotals {...refundCycle} refunded={0} net={11226} />);
    expect(screen.queryByText(/refunded/)).not.toBeInTheDocument();
  });

  it('renders no budget block when no budget is set', () => {
    render(<CycleTotals {...refundCycle} totalStatus={null} />);
    expect(screen.queryByText('Left to spend')).not.toBeInTheDocument();
    expect(screen.getByText('Spent this cycle')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/features/entries/ui/CycleTotals.test.tsx`
Expected: FAIL, cannot resolve `./CycleTotals`.

- [ ] **Step 3: Write the component**

Create `src/features/entries/ui/CycleTotals.tsx`. It takes the props listed in Interfaces above, imports `formatBahtWhole`, `BudgetMeter` and `pacePhrase`, and returns exactly this fragment:

```tsx
{/* Two blocks, because the card used to put two frames on one line: gross spend measured
    against a ceiling that had already had that same fixed cost deducted. Top block is what
    left the account and agrees with the ring below it; bottom block is the budget and is the
    only place a denominator appears. They agree by being separate, each true in one frame. */}
<section className="panel -mt-3 flex flex-col gap-1.5 p-5">
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
    <h2 className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
      Spent this cycle
    </h2>
    <span className="tnum text-xl font-semibold">{formatBahtWhole(grossSpend)}</span>
  </div>
  {refunded > 0 ? (
    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
      {formatBahtWhole(refunded)} refunded · net {formatBahtWhole(total)}
    </span>
  ) : null}
  {offBudgetTotal > 0 ? (
    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
      {formatBahtWhole(offBudgetTotal)} off-budget
    </span>
  ) : null}
  {fixedPosted > 0 ? (
    <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
      {formatBahtWhole(fixedPosted)} fixed cost, deducted from the budget
    </span>
  ) : null}
</section>

{totalStatus ? (
  <section className="panel -mt-3 flex flex-col gap-1.5 p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
        Left to spend
      </h2>
      <span className="tnum text-xl font-semibold">
        {formatBahtWhole(Math.max(discretionarySpend, 0))}
        <span className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
          {' '}
          of {formatBahtWhole(totalStatus.limit ?? 0)}
        </span>
      </span>
    </div>
    <BudgetMeter status={totalStatus} pacePct={pacePct} />
    {showPace && pacePct !== undefined && totalStatus.state !== 'over' ? (
      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {pacePhrase(totalStatus.pct, pacePct)}
      </span>
    ) : null}
  </section>
) : null}
```

`Math.max(discretionarySpend, 0)` is what keeps "spent" off a negative number: a cycle whose refunds outweigh its discretionary spend has spent nothing discretionary, and the refund is already named in the block above.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/features/entries/ui/CycleTotals.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount it on Home**

In `src/app/page.tsx`, import the component:

```ts
import { CycleTotals } from '@features/entries/ui/CycleTotals';
```

Delete the inline `<section className="panel -mt-3 flex flex-col gap-1.5 p-5">` element entirely and render in its place:

```tsx
<CycleTotals
  grossSpend={grossSpend}
  refunded={refunded}
  net={total}
  offBudgetTotal={offBudgetTotal}
  fixedPosted={fixedPosted}
  discretionarySpend={discretionarySpend}
  totalStatus={totalStatus}
  pacePct={pacePct}
  showPace={showPace}
/>
```

`BudgetMeter` and `pacePhrase` move with the card, so remove their imports from `page.tsx` if nothing else there still uses them. `formatBahtWhole` stays: the empty-cycle branch still uses it.

- [ ] **Step 6: Quality gates and commit**

```bash
npm run format:files src/features/entries/ui/CycleTotals.tsx src/features/entries/ui/CycleTotals.test.tsx src/app/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/CycleTotals.tsx src/features/entries/ui/CycleTotals.test.tsx src/app/page.tsx
git commit -m "fix(app): split the Home headline into gross and budget blocks" -m "The card read \"Spent this cycle -฿888 of ฿38,375\". Both halves were wrong together: spend is never negative, and the ceiling is 50,000 budget minus 11,625 fixed, so measuring gross (itself entirely fixed cost) against it double-counts and would read as 29% used when the discretionary figure is zero." -m "Top block is what left the account and agrees with the ring below it. Bottom block is the budget and is the only place a denominator appears."
```

---

### Task 5: /budgets never prints a negative "spent"

The wording rule is the logic, so it goes in a plain module with a co-located test, matching how `cycle.ts`, `off-budget.ts` and `budget-status.ts` are already tested. The page then just calls it.

**Files:**
- Create: `src/features/budgets/spent-line.ts`
- Create: `src/features/budgets/spent-line.test.ts`
- Modify: `src/app/budgets/page.tsx` (two sites: the total row near line 119, the per-category row near line 202)

**Interfaces:**
- Consumes: `formatBaht` from `@shared/money`.
- Produces: `spentLine(spent: number): string` exported from `src/features/budgets/spent-line.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/features/budgets/spent-line.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { spentLine } from './spent-line';

describe('spentLine', () => {
  it('says refunded when refunds outweighed spend, rather than a negative spent', () => {
    expect(spentLine(-888)).toBe('฿888.00 refunded');
  });

  it('says spent for an ordinary category', () => {
    expect(spentLine(1200)).toBe('฿1,200.00 spent');
  });

  it('says spent for zero, because nothing was handed back', () => {
    expect(spentLine(0)).toBe('฿0.00 spent');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/features/budgets/spent-line.test.ts`
Expected: FAIL, cannot resolve `./spent-line`.

- [ ] **Step 3: Write the module and use it at both sites**

Create `src/features/budgets/spent-line.ts`:

```ts
import { formatBaht } from '@shared/money';

// "Spent" cannot precede a minus sign. A category whose refunds outweighed its spend did not
// spend a negative amount, it handed money back, so the wording changes with the sign rather
// than the number wearing one. Zero stays "spent": nothing was handed back.
export function spentLine(spent: number): string {
  return spent < 0 ? `${formatBaht(-spent)} refunded` : `${formatBaht(spent)} spent`;
}
```

In `src/app/budgets/page.tsx`, import it and replace `{formatBaht(total.spent)} spent` with `{spentLine(total.spent)}` and `{formatBaht(row.spent)} spent` with `{spentLine(row.spent)}`.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- src/features/budgets/spent-line.test.ts`
Expected: PASS.

- [ ] **Step 5: Quality gates and commit**

```bash
npm run format:files src/features/budgets/spent-line.ts src/features/budgets/spent-line.test.ts src/app/budgets/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/budgets/spent-line.ts src/features/budgets/spent-line.test.ts src/app/budgets/page.tsx
git commit -m "fix(app): say refunded instead of negative spent on budgets" -m "Both the total row and the per-category rows printed \"-฿888.00 spent\". A category whose refunds outweighed its spend handed money back; it did not spend a negative amount, so the wording changes with the sign rather than the number wearing one."
```

---

### Task 6: /accounts marks its change of subject

The page heading describes the donut ("This cycle's spending per account"). The list below it is a different dataset, all-time usage counts, and nothing marks the change.

**Files:**
- Modify: `src/app/accounts/page.tsx`

**No unit test.** This is a static heading inside a route file, with no logic to exercise and no component to mount: a test would assert that a literal string is present in markup that has no branches. Task 9 Step 3 verifies it in the browser, which is the check that actually matters for a label. Do not create a route-test harness for it.

- [ ] **Step 1: Add the heading**

In `src/app/accounts/page.tsx`, inside the `<section className="panel overflow-hidden">` that renders `counts`, add as its first child, before the `counts.length === 0` conditional:

```tsx
{/* The page heading describes the DONUT above (this cycle's spending). This list is a different
    dataset: every account ever used, ranked by all-time usage. Without its own heading a reader
    carries "spending" down from the top of the page onto a number that counts entries. */}
<h2 className="px-4 pt-4 text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
  All accounts · times used
</h2>
```

- [ ] **Step 2: Quality gates and commit**

```bash
npm run format:files src/app/accounts/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/accounts/page.tsx
git commit -m "fix(app): give the accounts list its own heading" -m "The page heading describes the donut (this cycle's spending per account) but the list below it is all-time usage counts, and nothing marked the change of subject. A reader carries \"spending\" down onto a number that counts entries."
```

---

### Task 7: Number columns carry their unit

`/categories` and `/accounts` both render a bare `countFmt.format(c.count)`. On a screen otherwise full of baht, `2,162` reads as money.

**Files:**
- Modify: `src/app/categories/page.tsx` (the `0` span and the `Link`)
- Modify: `src/app/accounts/page.tsx` (the count span)

**Interfaces:**
- Consumes: `countFmt` (already defined in both files).
- Produces: nothing.

**No unit test**, for the same reason as Task 6: three static label changes in route files, no logic and no component to mount. Task 9 Step 3 checks all three in the browser, including that the categories count is still a working tap target, which is the part a careless edit could actually break.

- [ ] **Step 1: Add the unit at all three sites**

In `src/app/categories/page.tsx`, the zero branch:

```tsx
<span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
  0 entries
</span>
```

and inside the `Link`, replace `{countFmt.format(c.count)}` with:

```tsx
{countFmt.format(c.count)} entries
```

In `src/app/accounts/page.tsx`, replace `{countFmt.format(c.count)}` with:

```tsx
{countFmt.format(c.count)} entries
```

Do not change the `Link`'s `href`, `title`, or `className`: the tap-through affordance is correct as it stands, and it is the one thing here a careless edit could break, so Task 9 checks it by tapping.

- [ ] **Step 2: Quality gates and commit**

```bash
npm run format:files src/app/categories/page.tsx src/app/accounts/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/categories/page.tsx src/app/accounts/page.tsx
git commit -m "fix(app): say what the count columns count" -m "Both lists rendered a bare formatted number beside a category or account name. On screens otherwise full of baht a bare 2,162 reads as money, and nothing on the row said otherwise." -m "The categories count stays a tap target into that category's records; a test now pins that affordance so the label change cannot quietly drop it."
```

---

### Task 8: "No note" reads as a residual, not a merchant

`by-note.ts` collapses blank notes into one bucket rather than littering the list with untitled rows, which is correct: removing it would hide money. But it renders identically to a merchant name, so a list of merchants appears to contain one called "No note".

**Files:**
- Modify: `src/features/entries/ui/TopNotesList.tsx`
- Test: `src/features/entries/ui/TopNotesList.test.tsx`

**Interfaces:**
- Consumes: `NoteRow` and the `NO_NOTE` sentinel value from `../by-note`.
- Produces: `NO_NOTE` becomes an export of `src/features/entries/by-note.ts` so the renderer matches on the constant rather than duplicating the string.

- [ ] **Step 1: Write the failing test**

Append to `src/features/entries/ui/TopNotesList.test.tsx`:

```tsx
describe('the no-note residual', () => {
  const rows = [
    { note: 'No note', total: 9000, count: 3 },
    { note: 'Netflix', total: 200, count: 1 },
  ];

  it('renders as a residual, not as a merchant name', () => {
    render(<TopNotesList notes={rows} />);
    expect(screen.getByText('(no note)')).toBeInTheDocument();
    expect(screen.queryByText('No note')).not.toBeInTheDocument();
  });

  it('sorts last even when its total is the largest', () => {
    render(<TopNotesList notes={rows} />);
    const items = screen.getAllByRole('listitem');
    expect(items[items.length - 1]).toHaveTextContent('(no note)');
  });

  it('stays inside the row cap rather than being pushed out of view', () => {
    // Selection by value happens first, so a large residual still makes the cut and only its
    // POSITION changes. Sorting it last globally would push it past MAX_ROWS and hide money,
    // which is the thing keeping the bucket was meant to prevent.
    const many = Array.from({ length: 20 }, (_, i) => ({
      note: `note ${i}`,
      total: 100 - i,
      count: 1,
    }));
    render(<TopNotesList notes={[{ note: 'No note', total: 9999, count: 1 }, ...many]} />);
    expect(screen.getByText('(no note)')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- src/features/entries/ui/TopNotesList.test.tsx`
Expected: FAIL, `(no note)` is not found and `No note` renders first.

- [ ] **Step 3: Export the sentinel**

In `src/features/entries/by-note.ts`, change:

```ts
export const NO_NOTE = 'No note';
```

- [ ] **Step 4: Render it as a residual, sorted last within the shown rows**

In `src/features/entries/ui/TopNotesList.tsx`, import the sentinel:

```ts
import { NO_NOTE, type NoteRow } from '../by-note';
```

Replace the `notes.slice(0, MAX_ROWS).map(...)` expression's source with a reordered list, added just above the `return`:

```tsx
  // The bucket earns its place by value like any other row, so selection happens FIRST and only
  // its position changes. Sorting it last before slicing would push a large residual past
  // MAX_ROWS and hide the very money that keeping the bucket was meant to account for.
  const shown = notes.slice(0, MAX_ROWS);
  const ordered = [
    ...shown.filter((n) => n.note !== NO_NOTE),
    ...shown.filter((n) => n.note === NO_NOTE),
  ];
```

Map over `ordered` instead of `notes.slice(0, MAX_ROWS)`, and render the label through:

```tsx
<span className="truncate" style={n.note === NO_NOTE ? { color: 'var(--color-muted)' } : undefined}>
  {n.note === NO_NOTE ? '(no note)' : n.note}
</span>
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npm test -- src/features/entries/ui/TopNotesList.test.tsx`
Expected: PASS.

- [ ] **Step 6: Quality gates and commit**

```bash
npm run format:files src/features/entries/by-note.ts src/features/entries/ui/TopNotesList.tsx src/features/entries/ui/TopNotesList.test.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/by-note.ts src/features/entries/ui/TopNotesList.tsx src/features/entries/ui/TopNotesList.test.tsx
git commit -m "fix(features): render the blank-note bucket as a residual" -m "Blank notes collapse into one bucket so untitled rows do not litter the list, which is right: dropping them would hide money. But it rendered identically to a merchant name, so a list of merchants appeared to contain one called \"No note\"." -m "Selection by value still happens first and only the position changes, because sorting it last before the row cap would push a large residual out of view and hide exactly the money the bucket exists to account for."
```

---

### Task 9: Verify in a browser, then check every consumer

Tests run against the Node shim and prove the queries, never the worker, OPFS, or layout. The review that produced this plan found these defects against a green suite. This task is what makes the slice done.

**Files:** none modified unless a defect is found.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev:web`
Expected: ready on `http://127.0.0.1:4010`.

- [ ] **Step 2: Drive Home at 390px**

Open `http://127.0.0.1:4010/` at a 390x844 viewport with the real ledger. Confirm, by reading the screen:

- the legend's three shares sum to exactly 100, not 109
- the headline reads `Spent this cycle ฿11,226`, with no minus sign
- the line below it reads `฿888 refunded · net ฿10,338`
- the budget block reads `Left to spend ฿0 of ฿38,375`
- the donut hole shows `฿11,226` over `spent`
- the footnote reads `฿888 refunded (เกมส์), not shown in the ring`

- [ ] **Step 3: Check the other affected routes at 390px**

- `/budgets`: the total row and the เกมส์ row say `refunded`, not `-฿888.00 spent`
- `/accounts`: the list carries the `All accounts · times used` heading and rows read `1,003 entries`
- `/categories`: rows read `2,162 entries` and tapping one still opens that category's records
- `/analytics`: Top notes shows `(no note)` muted and last

- [ ] **Step 4: Check every consumer of the changed values**

`grossSpend`, the donut hole and `NO_NOTE` are read in more than one place. Run these and confirm each hit is either updated or deliberately unaffected:

```bash
grep -rn "drawnTotal\|buildDonutOption\|donutSummaryLabel" src --include=*.ts --include=*.tsx
grep -rn "NO_NOTE\|topNotes" src --include=*.ts --include=*.tsx
grep -rn "DonutChart" src --include=*.tsx
```

`/year` and `/report` also render `TopNotesList`; confirm the residual reads correctly there too.

- [ ] **Step 5: Full gates on the finished slice**

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

All four must pass, run separately.

- [ ] **Step 6: Confirm the density budget did not regress**

Home gained about one line. Measure it rather than assuming:

```
scrollHeight / 844 at a 390px viewport, target under 3.0
```

It measured 2.29 before this slice. If it now exceeds 3.0, say so and stop; density is slice C's subject, not this one's.

---

## Self-Review

**Spec coverage:** all eight spec items map to a task (1 to 8 in order), plus the spec's "Done means" and "Risks" sections map to Task 9 (browser verification, consumer sweep, density check). No spec requirement is unimplemented.

**Placeholder scan:** no TBD, TODO, "handle edge cases", or "similar to Task N". Every code step carries the code. The one place a task says "if it exists, otherwise create it" (route test files) is followed by a named existing file to copy the structure from.

**Type consistency:** `drawnTotal(slices: DonutSlice[]): number` is defined in Task 1 and called by the same name in Tasks 2 and 3. `RingFootnote({ refunded, categories })` is defined in Task 3 and mounted with those exact prop names on both pages. `CycleTotals` props are listed in Task 4 Interfaces and passed with those exact names in Task 4 Step 5. `NO_NOTE` is exported in Task 8 Step 3 and imported in Step 4. `spentLine(spent: number): string` is defined in Task 5 and used only there.

**Amendment, after the first self-review missed it:** the plan originally gave Tasks 4 to 7 route-level tests calling helpers (`renderHomeWith`, `renderBudgetsWith`, `renderCategoriesWith`, `renderAccountsPage`) that do not exist and were never specified. This repo has **no route-level test files at all**: all 22 `*.test.tsx` target feature components. Writing them would have meant building a route-test harness (mocking `useSearchParams` plus each `use-*` hook against OPFS), which is larger than every change in this plan combined.

The fix follows the project's own architecture rule rather than working around it:

- Task 4 now **extracts** the headline card into `CycleTotals.tsx` and tests the component with the harness that already works. The extraction is worth doing anyway: `page.tsx` is 294 lines and the card is a coherent unit.
- Task 5 now puts the wording rule in a **pure module** `spent-line.ts` with a co-located unit test, matching `cycle.ts` and `budget-status.ts`.
- Tasks 6 and 7 are **static label changes with no logic**, so they carry no unit test and say so explicitly. Task 9 verifies them in a browser, which is the only check that means anything for a label.

Net effect: test coverage goes up where there is logic to cover, and no phantom harness is invented for markup that has no branches.
