# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/analytics` route showing a 6-cycle spending trend with category drill-down and a budget-fit view, promoted into the tab bar in place of Budgets.

**Architecture:** One data primitive — a cycle × category matrix built by calling the **existing** `getCategoryBreakdown(db, start, end)` once per cycle — projects into all three views: total trend (sum each cycle), category trend (one column), budget fit (compare vs current limits). Pure option-builders + thin React wrappers, mirroring the existing `donut.ts` / `DonutChart.tsx` split. No schema change, no new dependency, no new SQL.

**Tech Stack:** Next.js 16 App Router (`output: 'export'`, all `'use client'`), React 19, TypeScript 5.9 strict (ESM, extensionless relative imports), ECharts 6, Tailwind v4, Vitest + `@testing-library/react`, drizzle-orm over the sqlite-proxy seam.

## Global Constraints

- **Read the spec first:** `docs/superpowers/specs/2026-07-17-analytics-design.md`.
- **TypeScript bans (enforced as ESLint errors):** no `any`, no `as` casts, no `!` non-null assertion, no `@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`. Prefer `type` over `interface`. Prefer `for..of` over `.forEach`. `as const` is allowed.
- **Formatting:** `Intl.*` only — never string manipulation for dates/numbers. Money via `@shared/money` (`formatBahtWhole` for glance figures — this whole feature is glance figures).
- **Window is 6 cycles.** Named constant `TREND_CYCLES = 6`.
- **Budget copy is fixed:** the budgets view header reads exactly **"Against your current limits."** Do not soften or reword — it is the honesty guarantee for a view that cannot know historical limits.
- **Dependency rule:** features → `db`/`shared`, never back. `entries` → `budgets` is the established direction (`use-home` already does it). `budgets` must **NOT** import from `entries` — see Task 3.
- **Quality gates before every commit:**
  ```bash
  npm run format:files <changed files>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
  All must pass.
- **Branch:** work on `feat/analytics` (already created; the spec is committed there).
- **Commits:** `type(scope): description` + a body explaining WHY. Scopes: `db`, `app`, `features`, `shared`. Use repeated `-m` flags — **never** `git commit -F` or a heredoc (the wrapped `git` on this machine never receives stdin and the commit-msg hook rejects it as empty).

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/features/entries/cycle.ts` | add `lastCycles` — enumerate the window | 1 |
| `src/features/entries/cycle.test.ts` | tests for `lastCycles` | 1 |
| `src/features/entries/trend.ts` | new — pure trend option-builder + `monthLabel` | 2 |
| `src/features/entries/trend.test.ts` | new — tests for the above | 2 |
| `src/features/budgets/budget-status.ts` | add `toBudgetFitRows` — the fit projection | 3 |
| `src/features/budgets/budget-status.test.ts` | tests for the above | 3 |
| `src/features/entries/use-analytics.ts` | new — the read hook, builds the matrix | 4 |
| `src/features/entries/use-analytics.test.ts` | new — `renderHook` test | 4 |
| `src/features/entries/ui/TrendChart.tsx` | new — thin ECharts wrapper | 5 |
| `src/shared/ui/ViewToggle.tsx` | new — extracted from Home's local `ViewLink` | 5 |
| `src/app/page.tsx` | use the shared `ViewToggle` | 5 |
| `src/app/analytics/page.tsx` | new — the route | 5 |
| `src/shared/ui/BottomBar.tsx` | Budgets slot → Analytics | 6 |
| `src/shared/ui/MoreSheet.tsx` | add Budgets; carry `cycle` on flagged links | 6 |

Tasks 1–3 are pure and independent. Task 4 consumes all three. Tasks 5–6 are UI. Nav goes **last** so the route exists before anything links to it.

---

### Task 1: `lastCycles` — enumerate the window

**Files:**
- Modify: `src/features/entries/cycle.ts`
- Test: `src/features/entries/cycle.test.ts`

**Interfaces:**
- Consumes: existing `Cycle`, `cycleFromKey`, `stepKey`, `CUTOFF` from `./cycle`.
- Produces: `lastCycles(key: string, n: number, cutoff?: number): Cycle[]` — `n` cycles **oldest first**, the anchor `key` **last**.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/entries/cycle.test.ts` (inside the existing top-level `describe`, or as a new `describe` — match the file's existing structure):

```ts
describe('lastCycles', () => {
  it('returns n cycles oldest first with the anchor last', () => {
    const got = lastCycles('2026-07', 6);
    expect(got.map((c) => c.key)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
  });

  it('rolls back across a year boundary', () => {
    expect(lastCycles('2026-01', 3).map((c) => c.key)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('returns just the anchor when n is 1', () => {
    expect(lastCycles('2026-07', 1).map((c) => c.key)).toEqual(['2026-07']);
  });

  it('returns an empty window when n is 0', () => {
    expect(lastCycles('2026-07', 0)).toEqual([]);
  });

  it('builds full cycles honouring the cutoff', () => {
    const [first] = lastCycles('2026-07', 2, 18);
    expect(first).toMatchObject({ key: '2026-06', start: '2026-06-18', end: '2026-07-17' });
  });

  it('honours a non-default cutoff', () => {
    const [first] = lastCycles('2026-07', 2, 1);
    expect(first).toMatchObject({ key: '2026-06', start: '2026-06-01', end: '2026-06-30' });
  });
});
```

Add `lastCycles` to the existing import from `./cycle` at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/entries/cycle.test.ts`
Expected: FAIL — `lastCycles is not a function` (or a TS error that it isn't exported).

- [ ] **Step 3: Write the implementation**

Append to `src/features/entries/cycle.ts`:

```ts
// The last `n` cycles ending at `key`, oldest first — the analytics trend window. The anchor is the
// LAST element, so a chart renders left-to-right in time order with the selected cycle at the right
// edge. Built from stepKey + cycleFromKey, so it inherits the cutoff-aware boundary math.
export function lastCycles(key: string, n: number, cutoff = CUTOFF): Cycle[] {
  return Array.from({ length: n }, (_, i) => cycleFromKey(stepKey(key, i - n + 1), cutoff));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/entries/cycle.test.ts`
Expected: PASS, all six new tests green.

- [ ] **Step 5: Quality gates**

```bash
npm run format:files src/features/entries/cycle.ts src/features/entries/cycle.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/cycle.ts src/features/entries/cycle.test.ts
git commit -m "feat(features): enumerate the last n billing cycles" -m "The analytics trend needs a window of cycles, not one. stepKey and cycleFromKey already do the cutoff-aware boundary math, so lastCycles is a map over an index range rather than new date logic." -m "Ordered oldest-first with the anchor last so a chart renders left-to-right in time order with the selected cycle at the right edge."
```

---

### Task 2: `trend.ts` — the pure option-builder

**Files:**
- Create: `src/features/entries/trend.ts`
- Test: `src/features/entries/trend.test.ts`

**Interfaces:**
- Consumes: `Cycle` from `./cycle`; `formatBahtWhole` from `@shared/money`.
- Produces:
  - `TREND_CYCLES: 6`
  - `monthLabel(key: string): string` — `'2026-07'` → `'Jul'`
  - `type TrendBar = { key: string; label: string; value: number; partial: boolean }`
  - `toTrendBars(cycles: Cycle[], spendByCycle: Map<string, number>, currentKey: string): TrendBar[]`
  - `type TrendPalette = { text: string; muted: string; border: string; accent: string; font: string }`
  - `buildTrendOption(bars: TrendBar[], p: TrendPalette)`

- [ ] **Step 1: Write the failing tests**

Create `src/features/entries/trend.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { monthLabel, toTrendBars, buildTrendOption, type TrendBar, type TrendPalette } from './trend';
import { lastCycles } from './cycle';

const PALETTE: TrendPalette = {
  text: '#fff',
  muted: '#888',
  border: '#333',
  accent: '#7c5cff',
  font: 'Inter',
};

describe('monthLabel', () => {
  it('renders the cycle key as its start month', () => {
    expect(monthLabel('2026-07')).toBe('Jul');
    expect(monthLabel('2026-01')).toBe('Jan');
    expect(monthLabel('2025-12')).toBe('Dec');
  });
});

describe('toTrendBars', () => {
  const cycles = lastCycles('2026-07', 3);

  it('maps each cycle to a bar in window order', () => {
    const bars = toTrendBars(cycles, new Map([['2026-05', 100]]), '2026-07');
    expect(bars.map((b) => b.key)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(bars.map((b) => b.label)).toEqual(['May', 'Jun', 'Jul']);
  });

  it('reads spend from the map and defaults a cycle with no spend to zero', () => {
    const bars = toTrendBars(cycles, new Map([['2026-05', 100]]), '2026-07');
    expect(bars.map((b) => b.value)).toEqual([100, 0, 0]);
  });

  it('marks only the live cycle partial', () => {
    const bars = toTrendBars(cycles, new Map(), '2026-07');
    expect(bars.map((b) => b.partial)).toEqual([false, false, true]);
  });

  it('marks nothing partial when the window is entirely in the past', () => {
    const past = lastCycles('2026-03', 3);
    const bars = toTrendBars(past, new Map(), '2026-07');
    expect(bars.map((b) => b.partial)).toEqual([false, false, false]);
  });
});

describe('buildTrendOption', () => {
  const bars: TrendBar[] = [
    { key: '2026-05', label: 'May', value: 100, partial: false },
    { key: '2026-06', label: 'Jun', value: 200, partial: false },
    { key: '2026-07', label: 'Jul', value: 50, partial: true },
  ];

  it('puts the bar labels on the x axis', () => {
    const option = buildTrendOption(bars, PALETTE);
    expect(option.xAxis.data).toEqual(['May', 'Jun', 'Jul']);
  });

  it('carries every bar value into the series', () => {
    const option = buildTrendOption(bars, PALETTE);
    expect(option.series[0].data.map((d) => d.value)).toEqual([100, 200, 50]);
  });

  it('accents the anchor bar and mutes the rest', () => {
    const option = buildTrendOption(bars, PALETTE);
    const colors = option.series[0].data.map((d) => d.itemStyle.color);
    expect(colors).toEqual([PALETTE.muted, PALETTE.muted, PALETTE.accent]);
  });

  it('fades the partial bar so an unfinished cycle never reads as a spending drop', () => {
    const option = buildTrendOption(bars, PALETTE);
    expect(option.series[0].data[2].itemStyle.opacity).toBeLessThan(1);
  });

  it('renders a complete anchor at full strength', () => {
    const complete = bars.map((b) => ({ ...b, partial: false }));
    const option = buildTrendOption(complete, PALETTE);
    expect(option.series[0].data[2].itemStyle.opacity).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/entries/trend.test.ts`
Expected: FAIL — cannot resolve `./trend`.

- [ ] **Step 3: Write the implementation**

Create `src/features/entries/trend.ts`:

```ts
import { formatBahtWhole } from '@shared/money';
import type { Cycle } from './cycle';

// The analytics window: six cycles fit at 412px with readable month labels, and six is enough to
// read a trend without the chart turning into noise.
export const TREND_CYCLES = 6;

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

// A cycle key ('2026-07') is anchored to its START month, so the axis label is that month's short
// name. Six-cycle windows never repeat a month, so the year is left off to keep the axis light.
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

// `partial` marks the live cycle — it is still filling up, so the chart must not present it as
// comparable to the finished ones. Keyed off the current cycle, NOT "the last bar": a window
// anchored to a past cycle is complete all the way to its right edge.
export type TrendBar = { key: string; label: string; value: number; partial: boolean };

// Window + per-cycle spend magnitudes → bars in window order. A cycle with no spend is a real zero
// (you spent nothing), not a gap, so it stays in the series.
export function toTrendBars(
  cycles: Cycle[],
  spendByCycle: Map<string, number>,
  currentKey: string,
): TrendBar[] {
  return cycles.map((c) => ({
    key: c.key,
    label: monthLabel(c.key),
    value: spendByCycle.get(c.key) ?? 0,
    partial: c.key === currentKey,
  }));
}

// Colours + font are injected (read from CSS tokens / computed style by the wrapper) so this stays
// pure and theme-aware without importing echarts or touching the DOM. Mirrors DonutPalette's
// contract; kept separate because a bar chart wants an accent and has no slice surface to border.
export type TrendPalette = {
  text: string;
  muted: string;
  border: string;
  accent: string;
  font: string;
};

// The anchor (last bar) is the cycle you selected — it carries the accent so the eye lands on
// "now" and reads the rest as context. Everything else is muted. A partial cycle is faded on top
// of that, whichever bar it is.
function barItemStyle(bar: TrendBar, anchorKey: string, p: TrendPalette) {
  const isAnchor = bar.key === anchorKey;
  return {
    color: isAnchor ? p.accent : p.muted,
    opacity: bar.partial ? 0.45 : isAnchor ? 1 : 0.55,
    borderRadius: [4, 4, 0, 0],
  };
}

// Returns a plain ECharts option: one bar per cycle, oldest → newest. The y axis is hidden — the
// tooltip and the list below carry the figures, and an axis of baht labels would crowd a 412px
// column for no gain.
export function buildTrendOption(bars: TrendBar[], p: TrendPalette) {
  const anchorKey = bars.length > 0 ? bars[bars.length - 1].key : '';
  return {
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e2128',
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
      },
    ],
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/entries/trend.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Quality gates**

```bash
npm run format:files src/features/entries/trend.ts src/features/entries/trend.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/trend.ts src/features/entries/trend.test.ts
git commit -m "feat(features): add the pure trend option-builder" -m "Charts here are pure, tested option-builders plus thin React wrappers (donut.ts / DonutChart.tsx). trend.ts is the builder half for the six-cycle spending bars." -m "The partial flag is keyed off the CURRENT cycle rather than the last bar: an unfinished cycle drawn at full strength next to finished ones reads as a spending drop, but a window anchored to a past cycle is complete all the way to its right edge."
```

---

### Task 3: `toBudgetFitRows` — the budget-fit projection

**Files:**
- Modify: `src/features/budgets/budget-status.ts`
- Test: `src/features/budgets/budget-status.test.ts`

**Interfaces:**
- Consumes: nothing new. This file is pure — **no DB, no React, and no `entries` import**.
- Produces:
  - `type FitCycle = { key: string; label: string; spent: number; over: boolean }`
  - `type BudgetFitRow = { category: string; limit: number; cycles: FitCycle[]; heldCount: number }`
  - `toBudgetFitRows(limits: Map<string, number>, matrix: Map<string, Map<string, number>>, window: { key: string; label: string }[]): BudgetFitRow[]`

**Dependency note — read before writing.** `budget-status.ts` must NOT import `Cycle` from `@features/entries/cycle`. The arrow already runs `entries` → `budgets` (`use-home` imports `toBudgetTotal`); importing back would make it circular at the feature level. That is why `window` is a structural `{ key, label }[]` rather than `Cycle[]` — TypeScript is structural, so Task 4 can hand it real `Cycle` objects (mapped to add the label) and it type-checks without the import.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/budgets/budget-status.test.ts`:

```ts
describe('toBudgetFitRows', () => {
  const WINDOW = [
    { key: '2026-05', label: 'May' },
    { key: '2026-06', label: 'Jun' },
    { key: '2026-07', label: 'Jul' },
  ];
  // cycle key → category → spend magnitude
  const MATRIX = new Map([
    ['2026-05', new Map([['Food', 900]])],
    ['2026-06', new Map([['Food', 1200]])],
    ['2026-07', new Map([['Food', 400]])],
  ]);

  it('marks a cycle over when spend exceeds the current limit', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), MATRIX, WINDOW);
    expect(row.cycles.map((c) => c.over)).toEqual([false, true, false]);
  });

  it('counts the cycles that would have held', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), MATRIX, WINDOW);
    expect(row.heldCount).toBe(2);
  });

  it('carries the window label and spend onto each cycle', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), MATRIX, WINDOW);
    expect(row.cycles).toEqual([
      { key: '2026-05', label: 'May', spent: 900, over: false },
      { key: '2026-06', label: 'Jun', spent: 1200, over: true },
      { key: '2026-07', label: 'Jul', spent: 400, over: false },
    ]);
  });

  it('treats spend exactly at the limit as held, matching the over/near model', () => {
    const [row] = toBudgetFitRows(new Map([['Food', 1200]]), MATRIX, WINDOW);
    expect(row.cycles.map((c) => c.over)).toEqual([false, false, false]);
    expect(row.heldCount).toBe(3);
  });

  it('reports a cycle with no spend in that category as zero, not a gap', () => {
    const sparse = new Map([['2026-06', new Map([['Food', 1200]])]]);
    const [row] = toBudgetFitRows(new Map([['Food', 1000]]), sparse, WINDOW);
    expect(row.cycles.map((c) => c.spent)).toEqual([0, 1200, 0]);
    expect(row.heldCount).toBe(2);
  });

  it('only includes budgeted categories — spend without a limit has nothing to fit', () => {
    const matrix = new Map([['2026-05', new Map([['Food', 900], ['Travel', 5000]])]]);
    const rows = toBudgetFitRows(new Map([['Food', 1000]]), matrix, WINDOW);
    expect(rows.map((r) => r.category)).toEqual(['Food']);
  });

  it('includes a budgeted category with no spend at all — it held every cycle', () => {
    const rows = toBudgetFitRows(new Map([['Gifts', 500]]), new Map(), WINDOW);
    expect(rows).toEqual([
      {
        category: 'Gifts',
        limit: 500,
        heldCount: 3,
        cycles: [
          { key: '2026-05', label: 'May', spent: 0, over: false },
          { key: '2026-06', label: 'Jun', spent: 0, over: false },
          { key: '2026-07', label: 'Jul', spent: 0, over: false },
        ],
      },
    ]);
  });

  it('ranks the worst-fitting budgets first, breaking ties by name', () => {
    const matrix = new Map([
      ['2026-05', new Map([['Food', 9000], ['Travel', 9000], ['Gifts', 1]])],
      ['2026-06', new Map([['Food', 9000], ['Travel', 1]])],
      ['2026-07', new Map([['Food', 9000], ['Travel', 1]])],
    ]);
    const limits = new Map([['Food', 100], ['Travel', 100], ['Gifts', 100]]);
    const rows = toBudgetFitRows(limits, matrix, WINDOW);
    // Food held 0, Travel held 2, Gifts held 3.
    expect(rows.map((r) => [r.category, r.heldCount])).toEqual([
      ['Food', 0],
      ['Travel', 2],
      ['Gifts', 3],
    ]);
  });
});
```

Add `toBudgetFitRows` to the existing import from `./budget-status` at the top of the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/budgets/budget-status.test.ts`
Expected: FAIL — `toBudgetFitRows is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/features/budgets/budget-status.ts`:

```ts
// One cycle's verdict for one budgeted category. `spent` is a magnitude ≥ 0; a cycle where the
// category saw no spend is a real 0, not a gap.
export type FitCycle = { key: string; label: string; spent: number; over: boolean };

export type BudgetFitRow = {
  category: string;
  limit: number;
  cycles: FitCycle[];
  heldCount: number; // cycles where spend stayed within the limit
};

// Budgets are STANDING — one row per category, no cycle column, and setBudget delete+inserts. There
// is no record of what any past cycle's limit was, so this CANNOT be a compliance record. It answers
// the question the data can actually answer: "with the limits I have now, how often would I have
// blown them?" — a budget-tuning tool. The UI must label it "Against your current limits."
//
// `window` is a structural { key, label }[] rather than entries' Cycle so this file stays free of a
// feature import (the arrow runs entries → budgets, never back).
//
// Only budgeted categories appear: spend with no limit has nothing to fit against. Ranked worst-fit
// first — the budgets most worth revisiting lead. Ties break by name for a stable order.
export function toBudgetFitRows(
  limits: Map<string, number>,
  matrix: Map<string, Map<string, number>>,
  window: { key: string; label: string }[],
): BudgetFitRow[] {
  const rows: BudgetFitRow[] = [];
  for (const [category, limit] of limits) {
    const cycles = window.map(({ key, label }) => {
      const spent = matrix.get(key)?.get(category) ?? 0;
      // `>` not `>=`: spend exactly at the limit is within it, matching classify()'s over rule.
      return { key, label, spent, over: spent > limit };
    });
    rows.push({
      category,
      limit,
      cycles,
      heldCount: cycles.filter((c) => !c.over).length,
    });
  }
  return rows.sort((a, b) => a.heldCount - b.heldCount || a.category.localeCompare(b.category));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/budgets/budget-status.test.ts`
Expected: PASS, all new tests green.

- [ ] **Step 5: Quality gates**

```bash
npm run format:files src/features/budgets/budget-status.ts src/features/budgets/budget-status.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/features/budgets/budget-status.ts src/features/budgets/budget-status.test.ts
git commit -m "feat(features): project budget fit across a window of cycles" -m "Budgets are standing: one row per category, no cycle column, and setBudget delete+inserts the old limit. The app has no record of what a past cycle's budget was, so budget HISTORY is unanswerable and this deliberately does not claim to be it." -m "Instead it answers what the data can answer: with the limits set now, how often would they have held? That reframes the view from a compliance record into a budget-tuning tool, needs no schema change, and works retroactively on day one. The window is a structural {key,label}[] rather than entries' Cycle so budgets never imports a feature back."
```

---

### Task 4: `use-analytics` — the read hook

**Files:**
- Create: `src/features/entries/use-analytics.ts`
- Test: `src/features/entries/use-analytics.test.ts`

**Interfaces:**
- Consumes: `lastCycles` (Task 1); `TREND_CYCLES`, `monthLabel`, `toTrendBars`, `TrendBar` (Task 2); `toBudgetFitRows`, `BudgetFitRow` (Task 3); existing `getCategoryBreakdown`, `Breakdown`, `toDonutSlices`, `DonutSlice`, `getCutoff`, `getIconSet`, `getEmojiMap`, `getHueMap`, `getBudgets`, `useDataVersion`, `todayIso`.
- Produces: `useAnalytics(cycleKey: string | null, category: string | null): { ready: boolean; data: AnalyticsData | null }` and the `AnalyticsData` type below.

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/use-analytics.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';
import { setBudget } from '@features/budgets/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useAnalytics } from './use-analytics';

// The window is anchored to the cycle key the caller passes, so — unlike useBudgetsPage's test —
// these never depend on the real clock and can use fixed dates. Cutoff 18 is settings' DEFAULT_CUTOFF
// (getCutoff returns it when the settings table has no row), so the cycle boundaries below are real.
//
// ensureEntriesTable bootstraps the categories + accounts FK tables too, so it is the only ledger
// ensure call needed here.
describe('useAnalytics', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureBudgetsTable(db);
    await ensureSettingsTable(db);
    await addEntries(db, [
      // cycle 2026-05 (18 May – 17 Jun) — Food 900
      { date: '2026-05-20', account: 'Cash', category: 'Food', amount: -900 },
      // cycle 2026-06 (18 Jun – 17 Jul) — Food 1200, Travel 300
      { date: '2026-06-20', account: 'Cash', category: 'Food', amount: -1200 },
      { date: '2026-07-01', account: 'Cash', category: 'Travel', amount: -300 },
      // cycle 2026-07 (18 Jul – 17 Aug) — Food 400
      { date: '2026-07-20', account: 'Cash', category: 'Food', amount: -400 },
      // Income is dropped by every read surface — it must not reach the trend.
      { date: '2026-07-21', account: 'Cash', category: 'Salary', amount: 50000 },
    ]);
    await setBudget(db, 'Food', 1000);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready', () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('totals spend per cycle across the window, newest last', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const bars = result.current.data?.bars ?? [];
    expect(bars.map((b) => b.key)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    // 2026-06 is Food 1200 + Travel 300; income never lands.
    expect(bars.map((b) => b.value)).toEqual([0, 0, 0, 900, 1500, 400]);
  });

  it('filters the same bars to one category when a filter is active', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([0, 0, 0, 900, 1200, 400]);
    expect(result.current.data?.category).toBe('Food');
  });

  it('aggregates the window into a category list, biggest first', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const slices = result.current.data?.slices ?? [];
    expect(slices.map((s) => s.name)).toEqual(['Food', 'Travel']);
    expect(slices.map((s) => s.value)).toEqual([2500, 300]);
  });

  it('reports the window total', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(2800);
  });

  it('projects budget fit against the current limit', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const [row] = result.current.data?.fitRows ?? [];
    expect(row.category).toBe('Food');
    expect(row.limit).toBe(1000);
    // Only 2026-06 (1200) exceeds 1000; the other five cycles held.
    expect(row.heldCount).toBe(5);
  });

  it('falls back to the current cycle when no key is given', async () => {
    const { result } = renderHook(() => useAnalytics(null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.activeKey).toBe(result.current.data?.currentKey);
    expect(result.current.data?.bars).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/use-analytics.test.ts`
Expected: FAIL — cannot resolve `./use-analytics`.

- [ ] **Step 3: Write the implementation**

Create `src/features/entries/use-analytics.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getCategoryBreakdown, type Breakdown } from './queries';
import { lastCycles, currentCycleKey, type Cycle } from './cycle';
import { TREND_CYCLES, monthLabel, toTrendBars, type TrendBar } from './trend';
import { toDonutSlices, type DonutSlice } from './donut';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getBudgets } from '@features/budgets/queries';
import { toBudgetFitRows, type BudgetFitRow } from '@features/budgets/budget-status';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

export type AnalyticsData = {
  activeKey: string;
  currentKey: string;
  cycles: Cycle[];
  bars: TrendBar[];
  category: string | null;
  slices: DonutSlice[];
  total: number;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  fitRows: BudgetFitRow[];
};

// Sum a window's breakdowns into one ranked Breakdown[] — the category list under the chart shows
// the WINDOW's composition, not one cycle's. Totals stay negative (the ledger's sign) so the result
// is a plain Breakdown[] that toDonutSlices can take unchanged.
function aggregate(breakdowns: Breakdown[][]): Breakdown[] {
  const byKey = new Map<string, Breakdown>();
  for (const rows of breakdowns) {
    for (const row of rows) {
      const seen = byKey.get(row.key);
      if (seen === undefined) byKey.set(row.key, { ...row });
      else byKey.set(row.key, { key: row.key, total: seen.total + row.total, count: seen.count + row.count });
    }
  }
  return [...byKey.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// The analytics window's data, read after mount from the browser OPFS db. Re-runs when the ?cycle=
// or ?category= param changes, or after any write (useDataVersion).
//
// ponytail: TREND_CYCLES separate getCategoryBreakdown calls rather than one windowed query. The
// cycle boundary is a cutoff-day concept computed in cycle.ts, not something SQL knows — expressing
// it in one statement needs a CASE ladder or raw-row bucketing, and the latter defeats the GROUP BY
// that getCategoryBreakdown exists for. Six bounded aggregates against local OPFS is cheap. Collapse
// into a windowed query if a slow device ever makes it felt.
export function useAnalytics(
  cycleKey: string | null,
  category: string | null,
): { ready: boolean; data: AnalyticsData | null } {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const [cutoff, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
      ]);

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeKey = cycleKey ?? currentKey;
      const cycles = lastCycles(activeKey, TREND_CYCLES, cutoff);

      const breakdowns = await Promise.all(
        cycles.map((c) => getCategoryBreakdown(db, c.start, c.end)),
      );

      // The one primitive: cycle key → category → spend magnitude. Every view below is a projection
      // of this. Totals arrive negative (outflows); the matrix stores magnitudes.
      const matrix = new Map<string, Map<string, number>>();
      for (const [i, rows] of breakdowns.entries()) {
        const byCategory = new Map<string, number>();
        for (const row of rows) byCategory.set(row.key, Math.abs(row.total));
        matrix.set(cycles[i].key, byCategory);
      }

      // Total trend = sum each cycle's row. Category trend = read one column. Same chart.
      const spendByCycle = new Map<string, number>();
      for (const [key, byCategory] of matrix) {
        const value =
          category === null
            ? [...byCategory.values()].reduce((sum, v) => sum + v, 0)
            : (byCategory.get(category) ?? 0);
        spendByCycle.set(key, value);
      }

      const bars = toTrendBars(cycles, spendByCycle, currentKey);
      const slices = toDonutSlices(aggregate(breakdowns));
      const total = [...spendByCycle.values()].reduce((sum, v) => sum + v, 0);

      const limits = new Map<string, number>();
      for (const b of await getBudgets(db)) {
        if (b.category !== null) limits.set(b.category, b.amount);
      }
      const fitRows = toBudgetFitRows(
        limits,
        matrix,
        cycles.map((c) => ({ key: c.key, label: monthLabel(c.key) })),
      );

      setData({
        activeKey,
        currentKey,
        cycles,
        bars,
        category,
        slices,
        total,
        emojiMap,
        hueMap,
        iconSet,
        fitRows,
      });
      setReady(true);
    })();
  }, [cycleKey, category, version]);

  return { ready, data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/use-analytics.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Quality gates**

```bash
npm run format:files src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
git commit -m "feat(features): read the analytics window into a cycle-by-category matrix" -m "The three questions analytics answers — am I spending more than usual, where is it going over time, do my budgets fit — are all projections of ONE structure: cycle key to category to magnitude. Building that matrix once means the category trend is the total trend filtered, not a second view." -m "Six existing getCategoryBreakdown calls rather than one windowed query: the cutoff-day cycle boundary is not a SQL concept, and raw-row bucketing would defeat the GROUP BY that query exists for. The ceiling is marked in a ponytail comment. The window is anchored to ?cycle= so it stays consistent with the cycle the rest of the app is showing."
```

---

### Task 5: The `/analytics` route

**Files:**
- Create: `src/features/entries/ui/TrendChart.tsx`
- Create: `src/shared/ui/ViewToggle.tsx`
- Create: `src/app/analytics/page.tsx`
- Modify: `src/app/page.tsx` (use the shared `ViewToggle`)

**Interfaces:**
- Consumes: `useAnalytics`/`AnalyticsData` (Task 4); `buildTrendOption`/`TrendPalette`/`TrendBar` (Task 2); `BudgetFitRow` (Task 3); existing `PageContainer`, `CategoryGlyph`, `HeaderFilterChip`, `emojiFor`, `formatBahtWhole`, `meterColorVar`.
- Produces: the route. Nothing imports it — Task 6 links to it.

- [ ] **Step 1: Extract the shared view toggle**

`src/app/page.tsx` has a local `ViewLink` function at the bottom. Analytics needs the same control, so it graduates to `shared/` per CLAUDE.md ("cross-feature reuse graduates a module to `shared/`").

Create `src/shared/ui/ViewToggle.tsx`:

```tsx
'use client';

import Link from 'next/link';

// The segmented control that switches a page between its views (?view=). Home and Analytics both
// want it and differ only in their hrefs, so it takes the items rather than knowing either page.
export type ViewOption = { label: string; href: string; active: boolean };

export function ViewToggle({ options }: { options: ViewOption[] }) {
  return (
    <div className="panel flex gap-1 p-1">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          prefetch={false}
          aria-current={o.active ? 'page' : undefined}
          className="flex-1 rounded-[var(--radius-md)] py-2 text-center text-sm font-medium transition-colors duration-150"
          style={{
            background: o.active ? 'var(--color-accent-soft)' : 'transparent',
            color: o.active ? 'var(--color-accent-text)' : 'var(--color-muted)',
          }}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
```

In `src/app/page.tsx`: delete the local `ViewLink` function entirely, add `import { ViewToggle } from '@shared/ui/ViewToggle';`, and replace the toggle block

```tsx
<div className="panel flex gap-1 p-1">
  <ViewLink label="Chart" active={!showList} href={`/?cycle=${activeKey}&view=chart`} />
  <ViewLink label="List" active={showList} href={`/?cycle=${activeKey}&view=category`} />
</div>
```

with

```tsx
<ViewToggle
  options={[
    { label: 'Chart', active: !showList, href: `/?cycle=${activeKey}&view=chart` },
    { label: 'List', active: showList, href: `/?cycle=${activeKey}&view=category` },
  ]}
/>
```

- [ ] **Step 2: Verify Home still builds and its tests pass**

Run: `npm run typecheck && npm test`
Expected: PASS. Home renders identically — this is a pure extraction, no behaviour change.

- [ ] **Step 3: Write the chart wrapper**

Create `src/features/entries/ui/TrendChart.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { TrendBar } from '../trend';
import { buildTrendOption } from '../trend';

// Thin wrapper: reads live theme tokens + the resolved font (canvas can't use CSS vars), hands them
// to the pure option-builder, and manages the echarts instance lifecycle. Logic lives in ../trend.ts.
export function TrendChart({ bars, label }: { bars: TrendBar[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const chart = echarts.init(el, null, { renderer: 'canvas' });
    const option = buildTrendOption(bars, {
      text: token('--color-text'),
      muted: token('--color-muted'),
      border: token('--color-border'),
      accent: token('--color-accent'),
      font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    });
    chart.setOption({ ...option, animation: !reduce });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [bars]);

  return <div ref={ref} className="h-56 w-full" role="img" aria-label={label} />;
}
```

Note: unlike `DonutChart` this is **not** `pointer-events-none` — there is no `CycleSwipe` wrapper on this page to pass a gesture through to, and the bar tooltips are worth keeping.

- [ ] **Step 4: Write the route**

Create `src/app/analytics/page.tsx`:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { ViewToggle } from '@shared/ui/ViewToggle';
import { useAnalytics } from '@features/entries/use-analytics';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import { emojiFor } from '@features/categories/queries';
import { meterColorVar, type BudgetFitRow } from '@features/budgets/budget-status';
import { formatBahtWhole } from '@shared/money';

// Analytics = the zoom-out surface. Home answers "what did I spend this cycle"; this answers "is that
// normal for me". Two views on a ?view= param: the six-cycle spending trend (default), and how the
// budgets set NOW would have fared across those cycles. The window is anchored to ?cycle= so it stays
// consistent with the cycle the rest of the app is showing.
export default function AnalyticsPage() {
  const params = useSearchParams();
  const cycleParam = params.get('cycle');
  const category = params.get('category');
  const view = params.get('view') ?? undefined;
  const { ready, data } = useAnalytics(cycleParam, category);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div className="grid h-32 place-items-center text-sm" style={{ color: 'var(--color-muted)' }}>
          …
        </div>
      </PageContainer>
    );
  }

  const { activeKey, bars, slices, total, emojiMap, iconSet, fitRows } = data;
  const showBudgets = view === 'budgets';
  const base = `/analytics?cycle=${activeKey}`;

  return (
    <PageContainer size="full">
      <ViewToggle
        options={[
          { label: 'Trend', active: !showBudgets, href: `${base}&view=trend` },
          { label: 'Budgets', active: showBudgets, href: `${base}&view=budgets` },
        ]}
      />

      {showBudgets ? (
        <section className="panel flex flex-col gap-5 p-5">
          <header className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Budget fit</h2>
            {/* Fixed copy — budgets are standing, so this view cannot know what a past cycle's
              limit was. Saying so is the whole honesty of the view. Do not reword. */}
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Against your current limits.
            </p>
          </header>
          {fitRows.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {fitRows.map((row) => (
                <FitRow key={row.category} row={row} />
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No budgets set yet.
            </p>
          )}
        </section>
      ) : (
        <section className="panel flex flex-col gap-5 p-5">
          <header className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="truncate text-base font-semibold">{category ?? 'All spending'}</h2>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                Last {bars.length} cycles
              </span>
            </div>
            <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
          </header>

          {category !== null ? (
            <div className="flex">
              <HeaderFilterChip href={`${base}&view=trend`} active label={category} />
            </div>
          ) : null}

          <TrendChart
            bars={bars}
            label={`${category ?? 'Total'} spending over the last ${bars.length} cycles`}
          />

          <ul className="flex flex-col gap-2.5">
            {slices.map((s) => {
              const inner = (
                <>
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full text-2xl"
                    style={{ background: s.color, color: 'var(--color-on-accent)' }}
                  >
                    <CategoryGlyph emoji={emojiFor(emojiMap, s.name)} iconSet={iconSet} size={26} />
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-1">
                    <span className="truncate">{s.name}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                      ({s.count})
                    </span>
                  </span>
                  <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                    {formatBahtWhole(s.value)}
                  </span>
                </>
              );
              // "Other" is a synthetic tail bucket, not a real category — nothing to filter to, so
              // it stays static. Same rule the home donut's legend follows.
              return (
                <li key={s.name} className="flex items-center gap-3 text-sm">
                  {s.other ? (
                    <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
                  ) : (
                    <Link
                      prefetch={false}
                      href={`${base}&view=trend&category=${encodeURIComponent(s.name)}`}
                      aria-label={`${s.name} trend`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}

// One budgeted category: its limit, how many cycles would have held, and a mini bar per cycle scaled
// to the worst cycle in the row. Pure CSS bars — BudgetMeter already proves this needs no chart.
function FitRow({ row }: { row: BudgetFitRow }) {
  const peak = Math.max(row.limit, ...row.cycles.map((c) => c.spent));
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{row.category}</span>
        <span className="tnum shrink-0 text-xs" style={{ color: 'var(--color-muted)' }}>
          {row.heldCount} of {row.cycles.length} cycles would have held · {formatBahtWhole(row.limit)}
        </span>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 44 }}>
        {row.cycles.map((c) => (
          <div key={c.key} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: `${peak > 0 ? Math.max(2, (c.spent / peak) * 32) : 2}px`,
                background: meterColorVar(c.over ? 'over' : 'under'),
                opacity: c.over ? 1 : 0.55,
              }}
              title={`${c.label}: ${formatBahtWhole(c.spent)}`}
            />
            <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}
```

- [ ] **Step 5: Run the full suite and gates**

```bash
npm run format:files src/app/analytics/page.tsx src/app/page.tsx src/shared/ui/ViewToggle.tsx src/features/entries/ui/TrendChart.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
```

Expected: PASS.

- [ ] **Step 6: Verify in a real browser — REQUIRED, not optional**

Tests run against the Node shim and prove the queries only. They prove **nothing** about the worker, OPFS, ECharts rendering, or layout. Per CLAUDE.md this is not done until driven at 412px.

```bash
npm run dev:web
```

Open `http://127.0.0.1:4010/analytics` at 412px width and confirm:
1. Six bars render, oldest → newest, month labels legible.
2. The last bar (current cycle) is visibly **faded** vs the others.
3. Tapping a category in the list filters the chart and shows the filter chip; tapping the chip clears it.
4. "Other" is not tappable.
5. The Budgets view shows "Against your current limits." and per-category mini bars with over-limit bars in the loss colour.
6. Nothing overflows the 412px column horizontally.

If the ledger is empty in this origin, add a few entries via the ＋ keypad first — remember OPFS is per-origin, so `127.0.0.1:4010` has its own database.

- [ ] **Step 7: Commit**

```bash
git add src/app/analytics/page.tsx src/app/page.tsx src/shared/ui/ViewToggle.tsx src/features/entries/ui/TrendChart.tsx
git commit -m "feat(app): add the analytics route" -m "The zoom-out surface: Home answers what you spent this cycle, this answers whether that is normal. A six-cycle trend with a category drill-down (the same chart, filtered — not a second view) plus how the budgets set now would have fared." -m "Home's local ViewLink graduates to shared/ui/ViewToggle since Analytics wants the same control and they differ only in hrefs. The budget mini bars are plain CSS — BudgetMeter already proves that needs no chart."
```

---

### Task 6: Nav — promote Analytics, demote Budgets

**Files:**
- Modify: `src/shared/ui/BottomBar.tsx`
- Modify: `src/shared/ui/MoreSheet.tsx`

**Interfaces:**
- Consumes: the `/analytics` route (Task 5); existing `cycleHref`, `isActivePath`.
- Produces: nothing consumed by later tasks — this is the last one.

The bar is a hard `grid-cols-5`: Home · Records · ＋ FAB · Budgets · More. There is no sixth slot, so Analytics takes the Budgets slot and Budgets moves into the More sheet.

- [ ] **Step 1: Swap the tab**

In `src/shared/ui/BottomBar.tsx`, replace the Budgets `BarTab` with:

```tsx
<BarTab
  href={cycleHref('/analytics', cycle)}
  label="Analytics"
  active={isActivePath(pathname, '/analytics')}
  icon={<AnalyticsIcon />}
/>
```

Analytics reads a cycle, so it is wrapped in `cycleHref` alongside Home and Records — the six-cycle window is anchored to `?cycle=`.

Replace the `BudgetsIcon` component with an `AnalyticsIcon` in the same style as the file's other icons (a consistent 24px outline set — match the existing stroke width and `viewBox` exactly; copy `BudgetsIcon`'s wrapper attributes and change only the paths):

```tsx
function AnalyticsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 20V12M12 20V5M19 20v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

Update the file's header comment — it currently reads "Home · Records · [＋ expense FAB → /entries/new] · Budgets · More". It must now read "Home · Records · [＋ expense FAB → /entries/new] · Analytics · More".

- [ ] **Step 2: Teach the More sheet to carry the cycle**

This is the step that matters. `BottomBar` wraps primary tabs in `cycleHref` so the selected cycle survives navigation. `MoreSheet`'s `LINKS` are bare `href` strings, justified by its comment: *"the More sheet's links go to pages that don't read a cycle, so they stay bare."* Budgets **does** read a cycle — demoted as-is, it silently loses the cycle selection on every tap.

In `src/shared/ui/MoreSheet.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Tags, Wallet, Plane, Repeat, Settings, Target } from 'lucide-react';
import { cycleHref } from './cycle-href';

// App-launcher grid for the overflow nav — one icon tile per destination, matching the 2×2 grid glyph
// on the "More" tab that opens this sheet. lucide icons (a dependency since the icon-set feature).
//
// `cycle: true` marks a destination that READS the selected cycle, so its href carries ?cycle= the
// same way BottomBar's primary tabs do. Budgets landed here when Analytics took its tab slot, and
// without this it would silently drop the cycle on every tap.
const LINKS = [
  { href: '/budgets', label: 'Budgets', Icon: Target, cycle: true },
  { href: '/categories', label: 'Categories', Icon: Tags },
  { href: '/accounts', label: 'Accounts', Icon: Wallet },
  { href: '/trips', label: 'Trips', Icon: Plane },
  { href: '/recurring', label: 'Recurring', Icon: Repeat },
  { href: '/settings', label: 'Settings', Icon: Settings },
] as const;
```

Inside the component, read the param and apply it per link:

```tsx
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cycle = useSearchParams().get('cycle');
  // …existing useEffect unchanged…
```

and in the map, replace `href={href}` with:

```tsx
{LINKS.map(({ href, label, Icon, cycle: carriesCycle }) => (
  <li key={href}>
    <Link
      href={carriesCycle === true ? cycleHref(href, cycle) : href}
      onClick={onClose}
      className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] p-3 transition-colors active:opacity-70"
    >
```

Everything else in the tile markup stays as it is.

Note: six tiles in a `grid-cols-2` is three rows, up from a ragged 2.5. No layout change needed.

- [ ] **Step 3: Run the gates**

```bash
npm run format:files src/shared/ui/BottomBar.tsx src/shared/ui/MoreSheet.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
```

Expected: PASS. If a test asserts on the Budgets tab, update it to the new nav rather than deleting it.

- [ ] **Step 4: Verify in a real browser — REQUIRED**

```bash
npm run dev:web
```

At 412px:
1. The bar reads **Home · Records · ＋ · Analytics · More**.
2. Tapping Analytics highlights its tab (accent pill + accent colour + heavier label).
3. **The cycle regression check:** on Home, step back a cycle with the `CycleSelector` (URL shows `?cycle=2026-06` or similar). Tap Analytics — the window must be anchored to **that** cycle, not today. Then open **More → Budgets** — the URL must still carry `?cycle=2026-06`. If Budgets lands bare, Step 2 didn't take.
4. Budgets still works from its new home.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/BottomBar.tsx src/shared/ui/MoreSheet.tsx
git commit -m "feat(shared): promote Analytics into the tab bar, demote Budgets to More" -m "The bar is a hard grid-cols-5 with no free slot, so making Analytics reachable costs a tab. Budgets is the one to move: it is a set-and-forget surface, while the trend is a look-often one." -m "MoreSheet's links were deliberately bare of cycleHref because nothing in it read a cycle — Budgets does, so demoting it as-is would have silently dropped the cycle selection on every tap. Links now carry ?cycle= when flagged, and the stale comment is corrected."
```

---

## Done criteria

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` all pass.
- `npm run build:web` produces a static export without error (the route is `'use client'` with no dynamic segment, so it prerenders).
- Driven at 412px in a real browser: trend renders, partial bar is faded, category filter round-trips, budgets view shows the fixed copy, and the cycle param survives Home → Analytics → More → Budgets.
