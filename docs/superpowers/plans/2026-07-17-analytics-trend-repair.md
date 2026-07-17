# Analytics Trend Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the analytics budget line with a six-cycle average of the user's own spending, make the filtered breakdown actually filter, and make the trend chart reachable by assistive technology.

**Architecture:** The average is derived inside `trend.ts` from the `bars` array it already receives — not threaded through the hook — because the average is definitionally a property of what is plotted. `buildTrendOption` loses its `limit` param and its `yAxis.max`; `use-analytics` loses its entire Budgets dependency. The filtered category list becomes a per-cycle breakdown so the header total sums the list beneath it. Net effect is a deletion.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless relative imports), React 19, Next.js 16 App Router (`output: 'export'`, every page `'use client'`), ECharts 6, Tailwind v4, Vitest + `@testing-library/react`.

**Spec:** `docs/superpowers/specs/2026-07-17-analytics-trend-repair-design.md`

## Global Constraints

- **TypeScript bans, enforced as ESLint errors:** no `any`, no `as` casting, no `!` assertion, no `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error`. Prefer `for..of` over `forEach`. Prefer `type` aliases over `interface`. `as const` is allowed.
- **No schema change, no new dependency, no new SQL, no new query.** Carried over from the prior analytics spec.
- **Money formatter by provenance:** `formatBahtWhole` for glance figures (every figure in this plan), `formatBaht` for computed/stored precision, `formatBahtKeyed` only for echoing user keystrokes.
- **One typeface app-wide.** Never introduce a monospace font for figures; `.tnum` (tabular-nums) on Plex Sans is the house rule.
- **Charts are pure, tested option-builders + thin React wrappers.** Logic goes in `trend.ts`, never in `TrendChart.tsx`.
- **Reads are async and post-mount.** Every read hook returns `{ ready, data }`; routes render a placeholder until `ready`.
- **Mobile-first, 412px phone frame.** There is no desktop layout. Verify at 412px.
- **Quality gates before every commit**, run separately so failures surface individually:
  ```bash
  npm run format:files <changed files>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
- **Commit format:** `type(scope): description` with a body explaining WHY. Scopes here: `features`, `app`, `shared`, `docs`. Use repeated `-m` flags — **never** `git commit -F <file>` and never a heredoc; the wrapped `git` on this machine receives no stdin and the commit-msg hook rejects it as empty.
- **Branch:** `feat/analytics-trend-repair` already exists and holds the spec commit. Do not work on `main`.

## File Structure

| File | Responsibility after this plan |
| --- | --- |
| `src/features/entries/trend.ts` | Pure trend logic: bar mapping, **the average**, **the a11y summary sentence**, the ECharts option. No budget concept. |
| `src/features/entries/trend.test.ts` | Unit tests for all of the above. Clock-free — bars are literals. |
| `src/features/entries/ui/TrendChart.tsx` | Thin wrapper: resolve tokens, call the builder, manage the instance. No string building, no logic. |
| `src/features/entries/use-analytics.ts` | Read hook: the cycle × category matrix and its projections. **No Budgets import.** |
| `src/features/entries/use-analytics.test.ts` | `renderHook` tests, incl. the P0 regression guard. |
| `src/features/entries/donut.ts` | Unchanged except the tooltip token. |
| `src/app/analytics/page.tsx` | Route: composes header, chart, and one of two lists. |
| `src/features/entries/ui/HeaderFilterChip.tsx` | Shared filter chip — Records **and** Analytics. |
| `src/shared/ui/Wordmark.tsx` | The app's `<h1>`. |

---

### Task 1: The average — `completeBars` and `trendAverage`

Purely additive. Nothing consumes these yet, so the tree stays green.

**Files:**
- Modify: `src/features/entries/trend.ts`
- Test: `src/features/entries/trend.test.ts`

**Interfaces:**
- Consumes: `TrendBar` (already exported from `trend.ts`).
- Produces: `completeBars(bars: TrendBar[]): TrendBar[]` and `trendAverage(bars: TrendBar[]): number | null`. Task 2 calls `trendAverage` inside `buildTrendOption`; Task 8 calls it from the page for the subtitle.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/entries/trend.test.ts`:

```ts
describe('completeBars', () => {
  it('drops the live cycle — it is still filling up, so it is not comparable', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 200, partial: true },
    ];
    expect(completeBars(bars).map((b) => b.key)).toEqual(['2026-05']);
  });

  it('drops zero cycles — a zero is almost always "not tracking yet", not "spent nothing"', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 0, partial: false },
      { key: '2026-06', label: 'Jun', value: 200, partial: false },
    ];
    expect(completeBars(bars).map((b) => b.key)).toEqual(['2026-06']);
  });

  it('keeps every complete cycle with spend', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 200, partial: false },
    ];
    expect(completeBars(bars)).toHaveLength(2);
  });
});

describe('trendAverage', () => {
  it('averages the complete cycles that have spend', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 300, partial: false },
    ];
    expect(trendAverage(bars)).toBe(200);
  });

  it('ignores the live cycle even when it is the largest bar', () => {
    // Day 30 of a heavy month must not drag the average up any more than day 2 drags it down.
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 300, partial: false },
      { key: '2026-07', label: 'Jul', value: 9000, partial: true },
    ];
    expect(trendAverage(bars)).toBe(200);
  });

  it('ignores leading zeros, so a short history is not averaged against months you were not tracking', () => {
    // The bug this prevents: four pre-tracking zeros halve the line, and then every real cycle
    // reports as above-normal.
    const bars: TrendBar[] = [
      { key: '2026-02', label: 'Feb', value: 0, partial: false },
      { key: '2026-03', label: 'Mar', value: 0, partial: false },
      { key: '2026-04', label: 'Apr', value: 100, partial: false },
      { key: '2026-05', label: 'May', value: 300, partial: false },
    ];
    expect(trendAverage(bars)).toBe(200);
  });

  it('returns null with one complete cycle — a line on your only bar is noise, not a comparison', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 300, partial: true },
    ];
    expect(trendAverage(bars)).toBeNull();
  });

  it('returns null with no data at all', () => {
    expect(trendAverage([])).toBeNull();
  });
});
```

Add `completeBars` and `trendAverage` to the existing import block at the top of the file (it already imports `monthLabel, toTrendBars, buildTrendOption, type TrendBar, type TrendPalette` from `./trend`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/entries/trend.test.ts`
Expected: FAIL — `completeBars is not a function` / `trendAverage is not a function`.

- [ ] **Step 3: Implement**

Add to `src/features/entries/trend.ts`, directly below `toTrendBars`:

```ts
// The average's basis: complete cycles that have spend. Two exclusions, each for a reason the
// chart already accepts.
//
// The live cycle, because `partial` exists precisely to stop an unfinished cycle being compared as
// if it were finished — and an average IS a comparison. On day 2 of the cycle you have spent ฿400
// of a typical ฿5,000; count it and the line sags for the rest of the month.
//
// Zero cycles, because `toTrendBars` deliberately renders "no data" and "spent nothing" as the same
// real zero (a gap would read as a rendering bug). That is right for bars and wrong for an average:
// if the ledger starts in May, the window's earlier zeros mean "not tracking yet", and averaging
// them in drags the line low enough to report every real cycle as above-normal.
//
// ponytail: `value > 0` cannot tell a genuine zero-spend complete cycle from a pre-tracking one, and
// excludes both — nudging the average up. In a single-user tracker a real zero-spend month means you
// did not open the app, so excluding it is the safer error. Upgrade path if that ever bites: a
// `min(date)` query against entries to find where tracking actually began.
export function completeBars(bars: TrendBar[]): TrendBar[] {
  return bars.filter((b) => !b.partial && b.value > 0);
}

// Null below two complete cycles: one cycle has no "normal" to compare against, and a line sitting
// exactly on your only bar is noise. The caller says why instead of drawing it.
export function trendAverage(bars: TrendBar[]): number | null {
  const basis = completeBars(bars);
  if (basis.length < 2) return null;
  return basis.reduce((sum, b) => sum + b.value, 0) / basis.length;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/features/entries/trend.test.ts`
Expected: PASS — all tests green, including the pre-existing ones.

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/features/entries/trend.ts src/features/entries/trend.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/entries/trend.ts src/features/entries/trend.test.ts
git commit -m "feat(features): add the trend average" -m "The reference line becomes your own average instead of a budget, so the chart answers the question the page actually asks: is this normal for me. Additive here — nothing consumes it until the next commit." -m "The basis excludes the live cycle (partial exists to stop exactly this comparison) and zero cycles (a window's leading zeros mean 'not tracking yet', and averaging them in reports every real cycle as above-normal). Null below two complete cycles, because a line on your only bar is noise."
```

---

### Task 2: Swap the budget line for the average

The `limit` param's removal cascades through four files, so this is one atomic commit — the tree does not typecheck partway through.

**Files:**
- Modify: `src/features/entries/trend.ts`
- Modify: `src/features/entries/trend.test.ts`
- Modify: `src/features/entries/ui/TrendChart.tsx`
- Modify: `src/features/entries/use-analytics.ts`
- Modify: `src/features/entries/use-analytics.test.ts`
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `trendAverage` (Task 1).
- Produces: `buildTrendOption(bars: TrendBar[], p: TrendPalette)` — two params, no third. `TrendChart({ bars, label })` — no `limit` prop. `AnalyticsData` no longer has `budgetLine`.

- [ ] **Step 1: Rewrite the failing tests**

In `src/features/entries/trend.test.ts`, **delete the entire `describe('buildTrendOption budget line', ...)` block** (lines 88-120) and replace it with:

```ts
describe('buildTrendOption average line', () => {
  const bars: TrendBar[] = [
    { key: '2026-05', label: 'May', value: 100, partial: false },
    { key: '2026-06', label: 'Jun', value: 300, partial: false },
    { key: '2026-07', label: 'Jul', value: 50, partial: true },
  ];

  it('draws the line at the average of the complete cycles', () => {
    expect(buildTrendOption(bars, PALETTE).series[0].markLine?.data).toEqual([{ yAxis: 200 }]);
  });

  it('names the line, so a bare figure cannot be read as a budget or a target', () => {
    expect(buildTrendOption(bars, PALETTE).series[0].markLine?.label.formatter).toBe('Average ฿200');
  });

  it('draws no line when there is too little history to average', () => {
    const thin: TrendBar[] = [{ key: '2026-07', label: 'Jul', value: 50, partial: true }];
    expect(buildTrendOption(thin, PALETTE).series[0].markLine).toBeUndefined();
  });

  it('never sets a y-axis max, so the bars are always scaled to the data', () => {
    // Regression guard. The budget line forced yAxis.max to reach a limit that could sit far above
    // every bar — a ฿4,899 bar under a ฿30,000 line rendered at 16% height. An average is always
    // inside the data's range, so the axis must simply never be forced again.
    expect(buildTrendOption(bars, PALETTE).yAxis.max).toBeUndefined();
  });

  it('keeps the line off the bars ink, so the reference reads as a reference', () => {
    expect(buildTrendOption(bars, PALETTE).series[0].markLine?.lineStyle.color).toBe(PALETTE.border);
  });
});
```

In `src/features/entries/use-analytics.test.ts`, **delete the three budget-line tests** (lines 92-108: `'uses the total budget as the budget line when unfiltered'`, `'uses the category budget as the budget line when filtered'`, `'has no budget line for a filtered category with no budget of its own'`). Leave the `setBudget` fixture lines and the `ensureBudgetsTable` import in place for now — Task 3 removes them, and deleting them here would break the `beforeEach` before its consumers are gone.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/entries/trend.test.ts`
Expected: FAIL — `markLine` is undefined (no average line is drawn yet) and the label assertion fails.

- [ ] **Step 3: Implement — `trend.ts`**

Replace `buildTrendOption` entirely (currently lines 60-124):

```ts
// Returns a plain ECharts option: one bar per cycle, oldest → newest. The y axis is hidden — the
// tooltip and the list below carry the figures, and an axis of baht labels would crowd a 412px
// column for no gain. A dashed line marks your own average across the window (see trendAverage);
// below two complete cycles there is nothing to average and no line is drawn.
export function buildTrendOption(bars: TrendBar[], p: TrendPalette) {
  const anchorKey = bars.length > 0 ? bars[bars.length - 1].key : '';
  const average = trendAverage(bars);
  return {
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: p.surface2,
      borderColor: p.border,
      borderWidth: 1,
      textStyle: { color: p.text, fontFamily: 'inherit' },
      valueFormatter: (v: number) => formatBahtWhole(v),
    },
    xAxis: {
      type: 'category',
      data: bars.map((b) => b.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.border } },
      axisLabel: { color: p.muted, fontFamily: p.font, fontSize: 12 },
    },
    // No `max`. The budget line forced the axis up to a limit that could sit far above every bar,
    // which shortened every bar in proportion to how far under budget you were — the same mechanism
    // that got the budgets view deleted. An average is always inside the data's range, so it cannot
    // be clipped and the axis never needs forcing. Do not reintroduce a reference that lives outside
    // the data without solving this again.
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'bar',
        barMaxWidth: 32,
        data: bars.map((b) => ({
          name: b.label,
          value: b.value,
          itemStyle: barItemStyle(b, anchorKey, p),
        })),
        markLine:
          average === null
            ? undefined
            : {
                silent: true,
                symbol: 'none',
                data: [{ yAxis: average }],
                // border, not muted: muted is every non-anchor bar's colour, so the line and the
                // data would share one ink and the reference would read as another bar.
                lineStyle: { color: p.border, type: 'dashed', width: 1 },
                label: {
                  formatter: `Average ${formatBahtWhole(average)}`,
                  position: 'insideEndTop',
                  color: p.muted,
                  fontFamily: p.font,
                  fontSize: 11,
                },
              },
      },
    ],
  };
}
```

Add `surface2` to `TrendPalette` (currently lines 40-46):

```ts
export type TrendPalette = {
  text: string;
  muted: string;
  border: string;
  surface2: string;
  accent: string;
  font: string;
};
```

Add `surface2: '#1e2128'` to the `PALETTE` fixture at the top of `trend.test.ts`.

- [ ] **Step 4: Implement — `TrendChart.tsx`**

Drop the `limit` prop and resolve the new token:

```tsx
export function TrendChart({ bars, label }: { bars: TrendBar[]; label: string }) {
```

Remove `limit,` from the destructure and the type, remove `limit,` from the `buildTrendOption(...)` call (it is now a two-arg call), add `surface2: token('--color-surface-2'),` to the palette object, and change the effect's dependency array from `[bars, limit]` to `[bars]`.

- [ ] **Step 5: Implement — `use-analytics.ts`**

Delete the Budgets dependency entirely:

- Remove the import: `import { getBudgets } from '@features/budgets/queries';`
- Remove `budgetLine: number | null;` from the `AnalyticsData` type.
- Delete this whole block (currently lines 103-112):
  ```ts
  const budgetRows = await getBudgets(db);
  const totalLimit = budgetRows.find((b) => b.category === null)?.amount ?? null;
  const limits = new Map<string, number>();
  for (const b of budgetRows) {
    if (b.category !== null) limits.set(b.category, b.amount);
  }
  const budgetLine = category === null ? totalLimit : (limits.get(category) ?? null);
  ```
- Remove `budgetLine,` from the `setData({ ... })` call.

- [ ] **Step 6: Implement — `analytics/page.tsx`**

Remove `budgetLine` from the destructure on line 37:

```tsx
const { activeKey, bars, slices, total, emojiMap, iconSet } = data;
```

And drop the `limit` prop from the chart:

```tsx
<TrendChart
  bars={bars}
  label={`${category ?? 'Total'} spending over the last ${bars.length} cycles`}
/>
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: clean. If it reports an unused `getBudgets`, `ensureBudgetsTable`, or `setBudget` in `use-analytics.test.ts`, leave them — Task 3 removes them.

- [ ] **Step 8: Gates and commit**

```bash
npm run format:files src/features/entries/trend.ts src/features/entries/trend.test.ts src/features/entries/ui/TrendChart.tsx src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts src/app/analytics/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add -A
git commit -m "feat(features): replace the analytics budget line with your own average" -m "Measured at 412px: a 4,899 baht bar under a 30,000 baht budget line rendered at 16% height with five empty months beside it. yAxis.max was forced up to the limit so the markLine could not be clipped, which shortened every bar in proportion to how far under budget you were. The page exists to read a SHAPE, and the shape degraded exactly when you were doing well." -m "The prior spec deleted the whole budgets view for this same bug — bars scaled to a limit made data vanish when under budget — then accepted the identical mechanism on the trend chart four sections earlier, naming it 'the same mechanism' while pardoning it. This applies that spec's own reasoning consistently." -m "An average is always inside the data's range, so it cannot be clipped: yAxis.max and the clipping hazard both go away. It also removes the referent switch (a budget line meant a total cap unfiltered and a category cap filtered, rendered identically) and the legend requirement. The line is labelled 'Average' rather than a bare figure, and drawn in border ink so it does not share muted with the bars. Analytics no longer reads budgets at all."
```

---

### Task 3: `cycleRows` and the P0 regression guard

**Files:**
- Modify: `src/features/entries/use-analytics.ts`
- Test: `src/features/entries/use-analytics.test.ts`

**Interfaces:**
- Produces: `type CycleRow = { key: string; label: string; value: number; count: number }` exported from `use-analytics.ts`; `AnalyticsData` gains `cycleRows: CycleRow[]`. Task 4 renders it.

- [ ] **Step 1: Write the failing tests**

The existing fixture already has two categories (Food and Travel) — that is enough. Add to `src/features/entries/use-analytics.test.ts`:

```ts
it('has no per-cycle rows when unfiltered — the list is the category breakdown then', async () => {
  const { result } = renderHook(() => useAnalytics('2026-07', null));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.data?.cycleRows).toEqual([]);
});

it('breaks the filtered category down per cycle, oldest first, skipping cycles with no spend', async () => {
  const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const rows = result.current.data?.cycleRows ?? [];
  expect(rows.map((r) => r.key)).toEqual(['2026-05', '2026-06', '2026-07']);
  expect(rows.map((r) => r.label)).toEqual(['May', 'Jun', 'Jul']);
  expect(rows.map((r) => r.value)).toEqual([900, 1200, 400]);
  expect(rows.map((r) => r.count)).toEqual([1, 1, 1]);
});

it('the header total sums the list beneath it', async () => {
  // The P0 regression guard. `total` was category-filtered while the list was not, so a filtered
  // page showed Food's total over a list of every category. Nothing asserted that the two agree,
  // which is the only reason it shipped.
  const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const rows = result.current.data?.cycleRows ?? [];
  const summed = rows.reduce((sum, r) => sum + r.value, 0);
  expect(summed).toBe(result.current.data?.total);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/entries/use-analytics.test.ts`
Expected: FAIL — `cycleRows` is undefined.

- [ ] **Step 3: Implement**

In `src/features/entries/use-analytics.ts`:

Add the import for `monthLabel` to the existing `./trend` import:
```ts
import { TREND_CYCLES, toTrendBars, monthLabel, type TrendBar } from './trend';
```

Add the type above `AnalyticsData`:
```ts
// One cycle's spend for the filtered category. The filtered list's row shape — the unfiltered list
// uses DonutSlice instead, because unfiltered the list decomposes by CATEGORY and filtered it
// decomposes by CYCLE. Two shapes because they answer two questions.
export type CycleRow = { key: string; label: string; value: number; count: number };
```

Add to `AnalyticsData`:
```ts
  cycleRows: CycleRow[];
```

The matrix must now carry counts alongside magnitudes. Replace the matrix block (currently lines 82-97):

```ts
// The one primitive: cycle key → category → { spend magnitude, entry count }. Every view below is
// a projection of this. Totals arrive negative (outflows); the matrix stores magnitudes.
const matrix = new Map<string, Map<string, { total: number; count: number }>>();
for (const [i, rows] of breakdowns.entries()) {
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const row of rows) byCategory.set(row.key, { total: Math.abs(row.total), count: row.count });
  matrix.set(cycles[i].key, byCategory);
}

// Total trend = sum each cycle's row. Category trend = read one column. Same chart.
const spendByCycle = new Map<string, number>();
for (const [key, byCategory] of matrix) {
  const value =
    category === null
      ? [...byCategory.values()].reduce((sum, v) => sum + v.total, 0)
      : (byCategory.get(category)?.total ?? 0);
  spendByCycle.set(key, value);
}

// Filtered, the list decomposes the header total per cycle — so it sums to the figure above it.
// Unfiltered there is nothing to decompose this way (the category list does that job), so it is
// empty. Cycles with no spend are skipped: a zero row is noise in a list, though it stays a real
// zero in the BARS, where a gap would read as a rendering bug.
const cycleRows: CycleRow[] =
  category === null
    ? []
    : cycles
        .map((c) => ({
          key: c.key,
          label: monthLabel(c.key),
          value: matrix.get(c.key)?.get(category)?.total ?? 0,
          count: matrix.get(c.key)?.get(category)?.count ?? 0,
        }))
        .filter((r) => r.value > 0);
```

Add `cycleRows,` to the `setData({ ... })` call.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/features/entries/use-analytics.test.ts`
Expected: PASS.

- [ ] **Step 5: Clean the now-dead Budgets fixture**

Task 2 deleted the tests that used it. Remove from `use-analytics.test.ts`:
- `import { ensureBudgetsTable } from '@features/budgets/schema';`
- `import { setBudget } from '@features/budgets/queries';`
- `await ensureBudgetsTable(db);`
- `await setBudget(db, 'Food', 1000);`
- `await setBudget(db, null, 20000); // the whole-cycle TOTAL budget (category_id IS NULL)`

Run: `npm test -- src/features/entries/use-analytics.test.ts`
Expected: PASS — the hook no longer touches budgets, so the fixture is not needed.

- [ ] **Step 6: Gates and commit**

```bash
npm run format:files src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
git commit -m "fix(features): make the analytics category filter filter the list too" -m "use-analytics derived the header total from spendByCycle, which reads ?category=, but the list from aggregate(breakdowns), which never did. So ?category=Food showed Food's total over a list of every category — the figure and the rows beneath it visibly disagreed, on a page about the user's own money." -m "The list now decomposes per cycle when filtered, so it sums to the total above it. It also lifts every per-cycle figure out of the tap-only ECharts tooltip and into readable text." -m "The regression guard asserts the total equals the sum of the rows. No test asserted the two agreed, which is the only reason this shipped: the dev ledger holds one category, and with one category the filtered and unfiltered lists are identical."
```

---

### Task 4: Render the per-cycle list

**Files:**
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `cycleRows` (Task 3).

- [ ] **Step 1: Implement**

Add `cycleRows` to the destructure:

```tsx
const { activeKey, bars, slices, total, emojiMap, iconSet, cycleRows } = data;
```

Replace the `<ul>` (currently lines 65-106) with a branch. When filtered, render cycle rows; otherwise the existing category list unchanged:

```tsx
{category !== null ? (
  // Filtered: the list decomposes the total above it per cycle. No category disc — every row is
  // the same category, so six identical discs would mark nothing. monthLabel is the x-axis's own
  // label fn, so the list and the chart always agree (incl. the start-month convention).
  <ul className="flex flex-col gap-2.5">
    {cycleRows.map((r) => (
      <li key={r.key} className="flex items-center text-sm">
        <Link
          prefetch={false}
          href={`/records?cycle=${r.key}&category=${encodeURIComponent(category)}`}
          aria-label={`${category} records for ${r.label}`}
          // min-h-11 (44px), NOT `.tap`: .tap is inline-flex and would fight the `flex` utility.
          // The category rows get their 44px for free from the size-11 disc — these rows have no
          // disc (every row is the same category), so without this they collapse to text height.
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
        >
          <span className="flex min-w-0 flex-1 items-baseline gap-1">
            <span className="truncate">{r.label}</span>
            <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
              ({r.count})
            </span>
          </span>
          <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
            {formatBahtWhole(r.value)}
          </span>
        </Link>
      </li>
    ))}
  </ul>
) : (
  <ul className="flex flex-col gap-2.5">
    {slices.map((s) => {
      /* ...existing category-list body, unchanged... */
    })}
  </ul>
)}
```

Keep the existing category-list body verbatim inside the `else` branch — do not rewrite it.

- [ ] **Step 2: Verify in the browser**

```bash
npm run dev:web
```

Open `http://127.0.0.1:4010/analytics` at 412px. **Use `127.0.0.1`, not `localhost`** — OPFS is scoped per origin and they hold different databases.

The dev ledger has one category (Coffee), which is exactly the blind spot that hid the P0. **Add a second category** with the ＋ keypad before checking, then confirm:
- Unfiltered: the category list is unchanged.
- Filtered: the list shows month rows, and they visibly sum to the header total.
- Tapping a month row lands on `/records` filtered to that cycle and category.

- [ ] **Step 3: Gates and commit**

```bash
npm run format:files src/app/analytics/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/app/analytics/page.tsx
git commit -m "feat(app): render the filtered analytics list per cycle" -m "The list now decomposes the header total it sits under. Rows carry no category disc — filtered, every row is the same category, so the marker would repeat itself six times and mark nothing. The month label reuses monthLabel so the list and the x-axis cannot disagree." -m "Each row drills to that cycle's records for the category, which also kills the self-filter no-op: the active category used to link to itself."
```

---

### Task 5: Make the chart readable without sight

**Files:**
- Modify: `src/features/entries/trend.ts`
- Modify: `src/features/entries/trend.test.ts`
- Modify: `src/features/entries/ui/TrendChart.tsx`
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Produces: `trendSummary(bars: TrendBar[], prefix: string): string`.

**Note — a deliberate deviation from the spec.** The spec called for a data-derived `aria-label` **and** a visually-hidden `<table>`. The table is dropped: a `sr-only` table is not keyboard-focusable, so it does not fix keyboard users as the spec claimed, and with the label already carrying every value a screen reader would read all six figures twice. The label alone does the job; six values is a sentence, not a table.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/entries/trend.test.ts`:

```ts
describe('trendSummary', () => {
  const bars: TrendBar[] = [
    { key: '2026-05', label: 'May', value: 100, partial: false },
    { key: '2026-06', label: 'Jun', value: 300, partial: false },
    { key: '2026-07', label: 'Jul', value: 50, partial: true },
  ];

  it('names every figure, so the canvas is not a dead end without sight', () => {
    expect(trendSummary(bars, 'Total spending over the last 3 cycles')).toBe(
      'Total spending over the last 3 cycles: May ฿100, Jun ฿300, Jul ฿50 (cycle in progress). Average ฿200.',
    );
  });

  it('marks the live cycle in words — its 45% opacity says so to nobody else', () => {
    expect(trendSummary(bars, 'x')).toContain('Jul ฿50 (cycle in progress)');
  });

  it('omits the average when there is too little history to have one', () => {
    const thin: TrendBar[] = [{ key: '2026-07', label: 'Jul', value: 50, partial: true }];
    expect(trendSummary(thin, 'x')).toBe('x: Jul ฿50 (cycle in progress).');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/features/entries/trend.test.ts`
Expected: FAIL — `trendSummary is not a function`.

- [ ] **Step 3: Implement — `trend.ts`**

Add below `trendAverage`:

```ts
// The chart's accessible text. ECharts draws to canvas and its tooltip is trigger:'item' — pointer
// only — so without this every figure the page exists to communicate is unreachable by keyboard or
// screen reader. The old aria-label was the chart's TITLE ("Total spending over the last 6 cycles"),
// which names the chart and states none of its data.
export function trendSummary(bars: TrendBar[], prefix: string): string {
  const figures = bars
    .map((b) => `${b.label} ${formatBahtWhole(b.value)}${b.partial ? ' (cycle in progress)' : ''}`)
    .join(', ');
  const average = trendAverage(bars);
  const averageSentence = average === null ? '' : ` Average ${formatBahtWhole(average)}.`;
  return `${prefix}: ${figures}.${averageSentence}`;
}
```

- [ ] **Step 4: Implement — `TrendChart.tsx`**

The wrapper takes the prefix and derives the full label, so the page stays free of string assembly:

```tsx
import { buildTrendOption, trendSummary } from '../trend';
```

and the return:

```tsx
return <div ref={ref} className="h-56 w-full" role="img" aria-label={trendSummary(bars, label)} />;
```

- [ ] **Step 5: Implement — `analytics/page.tsx`**

Announce the loading swap. Replace the placeholder `<div>` (currently lines 27-32):

```tsx
<div
  role="status"
  className="grid h-32 place-items-center text-sm"
  style={{ color: 'var(--color-muted)' }}
>
  …
</div>
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- src/features/entries/trend.test.ts`
Expected: PASS.

- [ ] **Step 7: Gates and commit**

```bash
npm run format:files src/features/entries/trend.ts src/features/entries/trend.test.ts src/features/entries/ui/TrendChart.tsx src/app/analytics/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/entries/trend.ts src/features/entries/trend.test.ts src/features/entries/ui/TrendChart.tsx src/app/analytics/page.tsx
git commit -m "fix(features): give the trend chart an accessible summary" -m "The chart shipped role=img with aria-label='Total spending over the last 6 cycles' — the chart's title, carrying no values, no reference and no direction. The bars are canvas and the tooltip is trigger:'item', pointer-only. A screen-reader user could learn a chart existed and nothing else, while the data sat in scope the whole time." -m "The label is now built from the bars, and states the live cycle in words — its 45% opacity says 'unfinished' to sighted users only. The loading placeholder gets role=status so the swap from an ellipsis to a full report is announced." -m "The summary is a pure function in trend.ts, per the repo's chart rule: logic in the tested builder, never in the wrapper."
```

---

### Task 6: The clear-filter chip

**Files:**
- Modify: `src/features/entries/ui/HeaderFilterChip.tsx`
- Modify: `src/app/analytics/page.tsx`

- [ ] **Step 1: Implement — `HeaderFilterChip.tsx`**

Two traps here, both real:

1. **Do not touch `.chip` in `globals.css`.** It has six usages and only two are interactive — `SwipeRow.tsx:228` and this file. The other four (`trips/page.tsx:72`, `budgets/page.tsx:80`, `records/page.tsx:138`, `RuleRow.tsx:182`) are decorative `<span>`s, and a blanket `min-height` would inflate them and wreck the dense Records, Budgets, and Trips layouts. Add the **existing `.tap`** class to this component instead — it already does `min-height: 44px` + `inline-flex` + `touch-action`, and is documented for exactly this.
2. **Do not delete `stopPropagation`.** It is redundant at the Analytics call site but load-bearing at `records/page.tsx:230`, where the chip sits inside a collapsible `<summary>` and the handler stops a filter tap from also toggling the section.

The `×` must be conditional: Records renders this chip **inactive** too ("Filter by Food"), where an `×` would be a lie.

```tsx
'use client';

import Link from 'next/link';

// A filter chip for a section header (Records, by category or by account) and for the Analytics
// header. It takes the `label` it filters on rather than naming an axis, so both of Records'
// groupings and Analytics' category filter can share it.
//
// On Records it lives inside a collapsible <summary>, so stopPropagation keeps the tap from also
// toggling the section open/closed — the same trick CategoryEditTrigger uses for the header's edit
// icon. Analytics has no <summary>, where the handler is simply a no-op. It's a client component
// only because a Server Component can't attach the onClick handler.
//
// `.tap` because this is the only visible way out of an active filter, and the chip's own padding
// leaves it 22px tall — half the 44px every touch target in this app clears. Do not "fix" that on
// `.chip` itself: four of its six usages are decorative spans that must stay small.
export function HeaderFilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={active ? `Clear ${label} filter` : `Filter by ${label}`}
      className="chip tap gap-1 transition-opacity active:opacity-70"
      style={
        active
          ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)' }
          : undefined
      }
    >
      <span className="truncate">{label}</span>
      {/* Active means "tap to clear", which the aria-label already says. The × says it to everyone
          else — without it the chip reads as a label, not a control. Inactive it would be a lie:
          on Records an inactive chip APPLIES a filter. */}
      {active ? <span aria-hidden>×</span> : null}
    </Link>
  );
}
```

Note `truncate` moved from the `<Link>` onto the inner `<span>` — the flex container cannot truncate itself once it has two children.

- [ ] **Step 2: Implement — `analytics/page.tsx`**

The chip's wrapper is a bare flex container, so `min-width: auto` stops the chip from ever shrinking and a long category name can push past the panel edge. Replace line 54:

```tsx
<div className="flex min-w-0">
```

- [ ] **Step 3: Verify in the browser**

At 412px on `http://127.0.0.1:4010/analytics`:
- The chip clears 44px (inspect it) and shows an `×`.
- Filter to a category with a deliberately long name (rename one to ~40 characters in Categories) and confirm the chip truncates instead of overflowing the panel.
- On `/records`, tapping a section-header chip still filters **without** toggling the section open — this is the `stopPropagation` regression.

- [ ] **Step 4: Gates and commit**

```bash
npm run format:files src/features/entries/ui/HeaderFilterChip.tsx src/app/analytics/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/entries/ui/HeaderFilterChip.tsx src/app/analytics/page.tsx
git commit -m "fix(features): make the filter chip a real touch target" -m "Measured 51.7x22px — half the 44px every other touch target in this app clears, on the only visible way out of an active filter. It also carried no ×, so it read as a label rather than a control: the aria-label said 'Clear Coffee filter' to screen readers and nothing said it to anyone else. Backwards for a touch surface." -m "Fixed with the existing .tap class rather than on .chip: four of .chip's six usages are decorative spans, and a blanket min-height would inflate them and wreck the dense Records, Budgets and Trips layouts. The × is conditional on active, because Records renders this chip inactive too, where an × would be a lie." -m "min-w-0 on the Analytics wrapper so a long category name truncates instead of pushing the chip past the panel edge."
```

---

### Task 7: The empty state and an honest subtitle

**Files:**
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `trendAverage` (Task 1), `EmptyLedger` (exists, no props, already used by Home and Records).

- [ ] **Step 1: Implement**

Add imports:

```tsx
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { trendAverage } from '@features/entries/trend';
```

**Do not reach for `cycleFromKey` here.** It defaults to `CUTOFF`, and the real cutoff comes from
settings — the page would render the wrong window for anyone who changed their cutoff day. It is also
unnecessary: `bars` already carries each cycle's `label` (its start month) and `key`, so the window
label needs neither the cutoff nor a second date computation.

After the destructure and `base`, add:

```tsx
// No spend anywhere in the window — reuse Home's empty state rather than inventing a second one.
// It teaches the interface (points at the keypad, offers the CSV restore) instead of saying "no
// data", which matters double here: moniflow is the create-sqlite-next-app reference, so a
// developer's first sight of Analytics is with an empty ledger.
if (slices.length === 0) {
  return (
    <PageContainer size="full">
      <EmptyLedger />
    </PageContainer>
  );
}

// "Last 6 cycles" asserted history the user may not have: lastCycles always returns six, so a
// day-one ledger claimed six cycles over five empty slots. Name the window instead, and when there
// is too little to average, say so — "is this normal for me" genuinely has no answer yet, and
// pretending otherwise is the opposite of what this app is for.
const last = bars[bars.length - 1];
const subtitle =
  trendAverage(bars) === null
    ? 'Come back next cycle to see whether this is typical'
    : `${bars[0].label} – ${last.label} ${last.key.split('-')[0]}`;
```

`bars[0].label` and `last.label` are the same start-month names the x-axis carries, so the subtitle
and the chart can never disagree — including on the start-month convention the prior spec pinned in
"Why the labels stay". For a window ending `2026-07` this reads `Feb – Jul 2026`.

Replace the subtitle span (currently lines 46-48):

```tsx
<span className="text-xs" style={{ color: 'var(--color-muted)' }}>
  {subtitle}
</span>
```

- [ ] **Step 2: Verify in the browser**

This is the one state the tests cannot see. At 412px:
- **Empty ledger.** Settings → Backup → restore an empty CSV, or use a fresh origin (`localhost:4010` is a *different* OPFS database from `127.0.0.1:4010` — this is the cheapest way to get a clean ledger). `/analytics` must show `EmptyLedger`, not a blank chart.
- **Thin history.** One cycle of entries → no average line, and the subtitle reads "Come back next cycle to see whether this is typical".
- **Normal.** Two or more complete cycles → the line appears and the subtitle names the window.

- [ ] **Step 3: Gates and commit**

```bash
npm run format:files src/app/analytics/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/app/analytics/page.tsx
git commit -m "feat(app): give analytics an honest first run" -m "A fresh ledger rendered 'All spending / Last 6 cycles / 0 baht' over six month labels, no bars and an empty list — the page looked broken. With one cycle it was worse: the only real bar is the partial one at 45% opacity, so the user's sole data point was the faintest ink on screen. Home has EmptyLedger; analytics inherited none of it." -m "lastCycles always returns six cycles regardless of history, so the subtitle asserted a history the user may not have. It now names the real window, or says there is not enough history to answer yet — which is the honest answer to 'is this normal for me' on day one." -m "EmptyLedger is reused, not rebuilt. It matters double here: moniflow is the create-sqlite-next-app reference implementation, so a developer's first sight of this page is with an empty ledger."
```

---

### Task 8: The app's missing `<h1>`

Scoped separately because it touches the shared shell, not `/analytics` — it is the one task worth rejecting on its own.

**Files:**
- Modify: `src/shared/ui/Wordmark.tsx`

- [ ] **Step 1: Implement**

The app has **no `<h1>` anywhere**: `layout.tsx` has none, `Wordmark` is a plain `<span>`, and every page's top heading is an `<h2>`. Heading navigation therefore starts at level 2 with no root. `Wordmark` is the one element on every page, so it is the `<h1>`.

Exactly two lines change in `src/shared/ui/Wordmark.tsx` — the outer `<span>` becomes `<h1>`. The
existing `inline-flex` class already overrides `h1`'s default `display: block`, and the inner
`text-[1.0625rem]` already pins the word's size against any global `h1` font-size rule, so nothing
moves.

```tsx
// The mark: a rounded accent tile carrying an 'm' monogram whose last stroke flows off into a
// money-line + arrow — the same mark as the app icon (src/app/icon.svg), kept in sync by hand.
// Uses the accent tokens so a reskin (swap --color-accent) recolors it for free.
//
// It is the app's <h1>: it is the one element on every page, and without it heading navigation
// started at <h2> with no root. inline-flex keeps it laid out exactly as the <span> was.
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <h1 className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* ...tile + svg + wordmark span, all unchanged... */}
    </h1>
  );
}
```

Keep the tile `<span>`, the `<svg>`, and the `moniflow` `<span>` byte-for-byte as they are; only the
outer element name and the comment change.

- [ ] **Step 2: Verify in the browser**

At 412px, the header must look **pixel-identical** to before. Then confirm exactly one `<h1>` exists:

```js
document.querySelectorAll('h1').length  // → 1
```

Check Home, Records, and Analytics — `EmptyLedger` contains its own `<h2>`, which is now correctly nested under the root rather than floating.

- [ ] **Step 3: Gates and commit**

```bash
npm run format:files src/shared/ui/Wordmark.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/shared/ui/Wordmark.tsx
git commit -m "fix(shared): give the app an h1" -m "There was no h1 anywhere: layout.tsx has none, Wordmark was a plain span, and every page's top heading is an h2. Heading navigation started at level 2 with no root, so a screen-reader user jumping by heading found the page's sections hanging off nothing." -m "Wordmark is the one element on every page, so it is the h1. Visually unchanged."
```

---

### Task 9: Chart plumbing — the hardcoded tooltip and the re-init

**Files:**
- Modify: `src/features/entries/donut.ts`
- Modify: `src/features/entries/ui/DonutChart.tsx`
- Modify: `src/features/entries/donut.test.ts`
- Modify: `src/features/entries/ui/TrendChart.tsx`

- [ ] **Step 1: Implement — the donut's tooltip token**

Task 2 already fixed this in `trend.ts`. `donut.ts:76` has the same hardcoded `backgroundColor: '#1e2128'` — the literal value of `--color-surface-2`, bypassing the token system and quietly breaking the "swap one accent token to reskin the whole app" promise PRODUCT.md makes to scaffold users.

- In `donut.ts`, add `surface2: string;` to `DonutPalette` (which already has `text`, `muted`, `border`, `surface`).
- Replace `backgroundColor: '#1e2128'` with `backgroundColor: p.surface2`.
- In `DonutChart.tsx`, add `surface2: token('--color-surface-2'),` beside the existing `token('--color-surface')` read.
- Add `surface2` to any `DonutPalette` fixture in `donut.test.ts`.

- [ ] **Step 2: Implement — `TrendChart` updates instead of rebuilding**

The effect depends on `[bars]`, and `bars` is a fresh array from every `useAnalytics` run, so every
`bumpDataVersion()` tears the chart down and builds a new one. Split init (once) from update (per
data change):

```tsx
'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { TrendBar } from '../trend';
import { buildTrendOption, trendSummary } from '../trend';

// Thin wrapper: reads live theme tokens + the resolved font (canvas can't use CSS vars), hands them
// to the pure option-builder, and manages the echarts instance lifecycle. Logic lives in ../trend.ts.
export function TrendChart({ bars, label }: { bars: TrendBar[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Init once. `bars` is a fresh array on every read, so keying this effect to it would dispose and
  // rebuild the whole instance after every write.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chartRef.current = chart;
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const option = buildTrendOption(bars, {
      text: token('--color-text'),
      muted: token('--color-muted'),
      border: token('--color-border'),
      surface2: token('--color-surface-2'),
      accent: token('--color-accent'),
      font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    });
    // notMerge. ECharts MERGES by default, so when the average line goes away — you delete entries
    // and drop below two complete cycles — a merged update would leave the old markLine painted on
    // a chart that no longer has an average. Replace the option outright.
    chart.setOption({ ...option, animation: !reduce }, true);
  }, [bars]);

  return <div ref={ref} className="h-56 w-full" role="img" aria-label={trendSummary(bars, label)} />;
}
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- src/features/entries/donut.test.ts`
Expected: PASS.

- [ ] **Step 4: Verify the update path in the browser**

The `notMerge` flag is the whole point of this step and no unit test covers the wrapper. At 412px on
`/analytics`, with a category filtered to a state that **has** an average line, delete entries via
`/records` until fewer than two complete cycles have spend. The line must **disappear**. If it
lingers, `notMerge` is missing.

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/features/entries/donut.ts src/features/entries/ui/DonutChart.tsx src/features/entries/donut.test.ts src/features/entries/ui/TrendChart.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add src/features/entries/donut.ts src/features/entries/ui/DonutChart.tsx src/features/entries/donut.test.ts src/features/entries/ui/TrendChart.tsx
git commit -m "fix(features): read the donut tooltip from a token, and stop rebuilding the trend chart" -m "The donut tooltip's backgroundColor was hardcoded '#1e2128' — the literal value of --color-surface-2 — so a reskin left it behind. PRODUCT.md promises a scaffolded project can recolour the whole app by swapping one token; two chart tooltips quietly broke that. The trend chart's copy went with the average line." -m "TrendChart keyed its whole lifecycle to bars, which is a fresh array on every read, so every write disposed and rebuilt the instance. Init is now once and updates are setOption — with notMerge, because a merged update would leave a stale average line painted after the average itself went away."
```

---

### Task 10: Correct the documents that now lie

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/analytics/page.tsx`
- Modify: `PRODUCT.md`
- Modify: `docs/superpowers/specs/2026-07-17-analytics-design.md`

- [ ] **Step 1: `globals.css` — delete the mono clause**

Lines 9-10 still describe "two IBM Plex families on a contrast axis (**sans = UI, mono = numbers**)" though only `--font-sans` exists — the mono was removed because it draws a dotted zero. The comment invites the next reader to "restore" the missing var and reintroduce exactly the thing the house rule bans.

Replace lines 9-10:

```css
  /* Type — ONE family app-wide: IBM Plex Sans carries UI, prose and figures alike. There is
     deliberately no mono: a mono face draws a slashed or dotted zero, which this project bans for
     figures. Numbers align through .tnum (font-variant-numeric: tabular-nums), not a second family.
     Do not add one. next/font (layout.tsx) defines the --font-plex-sans var this consumes. */
```

- [ ] **Step 2: `analytics/page.tsx` — fix the doc comment**

The header comment (lines 13-17) describes the deleted budget line and claims `?category=` narrows "the trend and breakdown" — which was false until Task 3 and is now true in a different way. Rewrite it to describe what the page does: the six-cycle trend with your own average marked, the category breakdown when unfiltered, and the per-cycle breakdown when filtered.

- [ ] **Step 3: `PRODUCT.md` — correct three stale claims**

It describes an app that no longer exists:
- "Next.js Server Components read them back **directly — no API layer** — and mutations go through Server Actions" → false since the OPFS migration. The browser is the system of record; every page is `'use client'` and loads after mount; writes are plain async functions in `actions.ts`, **not** Server Actions.
- The screen list has **Budgets** in the bottom nav and no Analytics. The bar is Home · Records · ＋ · Analytics · More; Budgets lives in the More sheet.
- "Money is rendered precisely in mono" in Design Principles → false and dangerous, for the same dotted-zero reason as Step 1. Figures are Plex Sans + `.tnum`.

- [ ] **Step 4: Amend the prior spec**

`docs/superpowers/specs/2026-07-17-analytics-design.md` still specifies the budget line as built. Leave the document intact as history, but:
- Add a `Superseded in part by: 2026-07-17-analytics-trend-repair-design.md` line under its `Status`.
- In the Decisions table, mark the "Budget comparison" and "Budget line" rows as superseded, pointing at the repair spec.
- Add a one-line note at the top of "The budget reference line" section saying it was reversed, and why: the section's accepted cost is the same mechanism the "budgets view, and why it went" section deletes a whole view over.
- **Leave "The budgets view, and why it went" untouched.** Its reasoning is what justifies the reversal.

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/app/globals.css src/app/analytics/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
git add -A
git commit -m "docs(app): correct the comments and docs that no longer describe this app" -m "globals.css still described 'sans = UI, mono = numbers' with only --font-sans defined, and PRODUCT.md still said money renders in mono. The mono was removed because it draws a dotted zero; both invited the next reader to restore it — a loaded gun aimed at the exact house rule they were describing." -m "PRODUCT.md also described Server Components reading SQLite directly with Server Action writes, and put Budgets in the bottom nav with no Analytics page. All false since the OPFS migration made the browser the system of record." -m "The analytics page comment described the deleted budget line. The prior analytics spec is marked superseded on the budget-line decisions only — its 'budgets view, and why it went' section stays, because that reasoning is what justifies reversing them."
```

---

### Task 11: Verify the whole surface in a browser

Tests run against the Node shim and prove the queries only. Per CLAUDE.md this work is not done until it has been driven at 412px — the tests prove nothing about the worker, OPFS, or layout, and every bug this plan fixes lived in exactly that gap.

- [ ] **Step 1: Full gates**

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:web
```

`build:web` is included because the app is a static export — a route that builds in dev can still fail `next build`.

- [ ] **Step 2: Drive it at 412px**

`npm run dev:web`, then `http://127.0.0.1:4010/analytics` (**not** `localhost` — different OPFS origin, different database) at 412×915.

| State | Expect |
| --- | --- |
| ≥2 complete cycles, 2+ categories | Bars scaled to the data, not squashed. Dashed line labelled `Average ฿…`. Subtitle names the window. |
| Filtered to a category | Header total sums the month rows beneath it. Chip is 44px with an `×`. Tapping `×` clears. |
| One cycle only | No line. Subtitle: "Come back next cycle to see whether this is typical". |
| Empty ledger | `EmptyLedger`, not a blank chart. |
| Long category name (~40 chars) | The chip truncates; the panel does not overflow; no horizontal scroll. |
| `/records` | Section-header chips still filter **without** toggling the section — the `stopPropagation` regression. |

- [ ] **Step 3: Confirm the fix that started this**

The original defect, side by side: the same single-category bar rendered at ~16% height unfiltered and full height filtered, because `yAxis.max` was pinned to the budget. Now the unfiltered and filtered views must be **visually comparable** — the same data at the same scale.

- [ ] **Step 4: Screen reader spot-check**

Inspect the chart element. Its `aria-label` must contain every figure and mark the live cycle in words:

```js
document.querySelector('[role="img"]').getAttribute('aria-label')
// → "Total spending over the last 6 cycles: Feb ฿0, … Jun ฿1,500 (cycle in progress). Average ฿650."
```

And `document.querySelectorAll('h1').length` → `1`.

- [ ] **Step 5: Finish the branch**

Use `superpowers:finishing-a-development-branch` to decide how this lands.

---

## Notes for the implementer

- **`use-analytics.test.ts` depends on the real clock** — `currentCycleKey(todayIso(), cutoff)` is not injected. Today (2026-07-17, cutoff 18) the current cycle is `2026-06`, so in that fixture the *fifth* bar is the partial one, not the last. Do not "fix" a test by assuming the last bar is partial. All the average tests live in `trend.test.ts` with literal bars for exactly this reason — keep them clock-free.
- **The compressor eats sparse output.** `grep`/`git` output through the wrapped shell is lossy on hash-heavy or empty results; an empty grep here is not proof of absence. Confirm with `Glob` or a drill-down before concluding something does not exist.
- **Never `git commit -F`** and never a heredoc commit message — the wrapped `git` receives no stdin and the commit-msg hook rejects the empty message. Repeated `-m` flags only.
- **Scope is one word.** `docs(features)`, not `docs(features,app)` — comma scopes are rejected.
