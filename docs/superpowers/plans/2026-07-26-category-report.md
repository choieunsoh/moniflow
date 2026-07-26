# Category report (`/report`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/report` — pick a category from a ranked list, then see that category's spending over time, with a Monthly (one year, per cycle) / Yearly (every year on record) toggle.

**Architecture:** One route with two states, driven entirely by URL search params (`?category=`, `?view=`, `?year=`) — the pattern `/month` and `/analytics` already use. Data comes from the `getCategoryBreakdown`-per-window matrix those two hooks already build (`key → category → {value,count}`): unfiltered a view sums a row, filtered it reads one column. That builder is extracted to a shared module in Task 1 so this feature adds a third caller instead of a third copy. No new SQL, **no schema change** — so no `schema.ts` / `BOOTSTRAP_SQL` / `COLUMN_MIGRATIONS` lockstep work.

**Tech Stack:** Next.js 16 App Router (static export, every page `'use client'`), React 19, TypeScript 5.9 strict, drizzle-orm over the sqlite-proxy seam, Vitest + `@testing-library/react` (`renderHook`) against the better-sqlite3 Node shim.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-26-category-report-design.md`. Read it before Task 1.
- **Branch:** `feat/category-report` (already created, spec already committed).
- **TypeScript bans (enforced as ESLint errors):** no `any`, no `as` casts, no `!` assertions, no `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error`. Prefer `for..of` over `forEach`. `type` aliases, never `interface`. `as const` is allowed.
- **Money:** `formatBahtWhole` for every figure on this page (glance figures — short beats exact). Never `formatBaht` or `formatBahtKeyed` here.
- **Touch targets:** every tappable row clears 44px — `min-h-11` on rows that carry no `CategoryIcon` disc (the disc supplies 44px on its own).
- **Reads are async and post-mount.** The hook returns `{ ready, data }`; the route renders a `…` placeholder until `ready`.
- **Do not modify** `src/features/entries/use-analytics.ts` — it builds a by-account matrix too and is out of scope.
- **Quality gates before every commit**, run separately so failures surface individually:
  ```bash
  npm run format:files <changed files>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
- **Commit format:** `type(scope): description` + a body explaining WHY. Scopes here: `features`, `app`, `shared`. Use repeated `-m` flags — never `-F` or a heredoc. Never add a `Claude-Session:` trailer.

**Correction to the spec:** the spec says `ViewToggle` is a new component. It is **not** — `src/shared/ui/ViewToggle.tsx` already exists with exactly the API needed (`options: {label, href, active}[]`, used by Home and Analytics). Reuse it; do not create a second one.

---

### Task 1: The breakdown matrix + the pure fold

Extract the matrix builder `use-month.ts` keeps private, then build the pure fold that turns a matrix plus a labelled list of periods into bars, a ranked category list, and per-period rows.

**Files:**
- Create: `src/features/entries/breakdown-matrix.ts`
- Create: `src/features/entries/category-report.ts`
- Create: `src/features/entries/category-report.test.ts`
- Modify: `src/features/entries/use-month.ts` (delete its private `buildMatrix`, import the shared one)

**Interfaces:**
- Consumes: `getCategoryBreakdown(db, start, end)` from `./queries`; the `Db` type from `@db/client`; `TrendBar` from `./trend`.
- Produces:
  - `type BreakdownWindow = { key: string; start: string; end: string }`
  - `type BreakdownMatrix = Map<string, Map<string, { value: number; count: number }>>`
  - `buildBreakdownMatrix(db: Db, windows: BreakdownWindow[]): Promise<BreakdownMatrix>`
  - `type ReportView = 'monthly' | 'yearly'`
  - `type ReportPeriod = { key: string; label: string; partial: boolean }`
  - `type ReportCategory = { name: string; value: number; count: number }`
  - `type ReportRow = { key: string; label: string; value: number; count: number }`
  - `type CategoryReport = { bars: TrendBar[]; total: number; categories: ReportCategory[]; rows: ReportRow[] }`
  - `foldCategoryReport(matrix: BreakdownMatrix, periods: ReportPeriod[], category: string | null): CategoryReport`

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/category-report.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { foldCategoryReport, type ReportPeriod } from './category-report';
import type { BreakdownMatrix } from './breakdown-matrix';

// [category]: [value, count] per period key — the matrix the db builder produces, hand-written so
// the fold is tested without a database.
function matrixOf(spec: Record<string, Record<string, [number, number]>>): BreakdownMatrix {
  const matrix: BreakdownMatrix = new Map();
  for (const [key, byCategory] of Object.entries(spec)) {
    const inner = new Map<string, { value: number; count: number }>();
    for (const [name, [value, count]] of Object.entries(byCategory))
      inner.set(name, { value, count });
    matrix.set(key, inner);
  }
  return matrix;
}

const PERIODS: ReportPeriod[] = [
  { key: '2026-01', label: 'Jan', partial: false },
  { key: '2026-02', label: 'Feb', partial: false },
  { key: '2026-03', label: 'Mar', partial: true },
];

const MATRIX = matrixOf({
  '2026-01': { Food: [1000, 4], Travel: [500, 1] },
  '2026-02': { Food: [300, 2] },
  '2026-03': { Travel: [200, 1] },
});

describe('foldCategoryReport', () => {
  it('unfiltered, sums every category in each period', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, null);
    expect(report.bars.map((b) => b.value)).toEqual([1500, 300, 200]);
    expect(report.total).toBe(2000);
  });

  it('unfiltered, ranks categories over the WHOLE window, biggest first', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, null);
    expect(report.categories).toEqual([
      { name: 'Food', value: 1300, count: 6 },
      { name: 'Travel', value: 700, count: 2 },
    ]);
    // The rows list is the filtered view's job — it must not also answer here.
    expect(report.rows).toEqual([]);
  });

  it('filtered, reads one column and the total sums that column', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, 'Food');
    expect(report.bars.map((b) => b.value)).toEqual([1000, 300, 0]);
    expect(report.total).toBe(1300);
    expect(report.categories).toEqual([]);
  });

  it('filtered, keeps periods with no spend so the list matches the chart', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, 'Food');
    expect(report.rows).toEqual([
      { key: '2026-01', label: 'Jan', value: 1000, count: 4 },
      { key: '2026-02', label: 'Feb', value: 300, count: 2 },
      { key: '2026-03', label: 'Mar', value: 0, count: 0 },
    ]);
  });

  it('carries each period’s partial flag onto its bar', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, null);
    expect(report.bars.map((b) => b.partial)).toEqual([false, false, true]);
  });

  it('renders a period missing from the matrix as a real zero, not a gap', () => {
    const periods = [...PERIODS, { key: '2026-04', label: 'Apr', partial: false }];
    const report = foldCategoryReport(MATRIX, periods, null);
    expect(report.bars).toHaveLength(4);
    expect(report.bars[3]).toEqual({ key: '2026-04', label: 'Apr', value: 0, partial: false });
  });

  it('labels bars from the periods, so a yearly window reads as years', () => {
    const yearly: ReportPeriod[] = [
      { key: '2025', label: '2025', partial: false },
      { key: '2026', label: '2026', partial: true },
    ];
    const report = foldCategoryReport(matrixOf({ '2025': { Food: [900, 3] } }), yearly, 'Food');
    expect(report.bars.map((b) => b.label)).toEqual(['2025', '2026']);
    expect(report.bars.map((b) => b.value)).toEqual([900, 0]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm test -- src/features/entries/category-report.test.ts
```

Expected: FAIL — `Failed to resolve import "./category-report"`.

- [ ] **Step 3: Create the shared matrix builder**

Create `src/features/entries/breakdown-matrix.ts`:

```ts
import type { Db } from '@db/client';
import { getCategoryBreakdown } from './queries';

// A span the matrix is built over — one cycle, or a whole year. `Cycle` satisfies this structurally,
// so /month can hand its cycles straight in without a mapping step.
export type BreakdownWindow = { key: string; start: string; end: string };

// window key → category → { value, count }. THE primitive behind every category-over-time surface:
// unfiltered a view sums a row, filtered it reads one column. Values are MAGNITUDES — totals arrive
// negative (the ledger's sign) and every read surface in this app shows spend.
export type BreakdownMatrix = Map<string, Map<string, { value: number; count: number }>>;

// ponytail: one bounded aggregate per window rather than a single windowed query — a window boundary
// is a cutoff-day concept computed in cycle.ts, not something SQL knows, so one statement would need
// a CASE ladder or raw-row bucketing that defeats the GROUP BY. A dozen aggregates against local
// OPFS is cheap; the alternative is loading a decade of rows to use a twelfth of them. Collapse it
// if a slow device ever makes it felt.
export async function buildBreakdownMatrix(
  db: Db,
  windows: BreakdownWindow[],
): Promise<BreakdownMatrix> {
  const breakdowns = await Promise.all(
    windows.map((w) => getCategoryBreakdown(db, w.start, w.end)),
  );
  const matrix: BreakdownMatrix = new Map();
  for (const [i, rows] of breakdowns.entries()) {
    const byCategory = new Map<string, { value: number; count: number }>();
    for (const row of rows)
      byCategory.set(row.key, { value: Math.abs(row.total), count: row.count });
    matrix.set(windows[i].key, byCategory);
  }
  return matrix;
}
```

- [ ] **Step 4: Create the pure fold**

Create `src/features/entries/category-report.ts`:

```ts
import type { TrendBar } from './trend';
import type { BreakdownMatrix } from './breakdown-matrix';

export type ReportView = 'monthly' | 'yearly';

// One bucket of the window, already labelled. The fold stays view-agnostic: monthly passes cycles
// (label = the month), yearly passes years (label = the year), and neither shape leaks in here —
// which is why one fold serves both views instead of two that can drift apart.
export type ReportPeriod = { key: string; label: string; partial: boolean };

export type ReportCategory = { name: string; value: number; count: number };
export type ReportRow = { key: string; label: string; value: number; count: number };

export type CategoryReport = {
  bars: TrendBar[];
  total: number;
  // Unfiltered only — the picker list. Empty when a category is selected.
  categories: ReportCategory[];
  // Filtered only — the headline decomposed period by period. Empty when no category is selected,
  // so the two lists never both answer at once.
  rows: ReportRow[];
};

export function foldCategoryReport(
  matrix: BreakdownMatrix,
  periods: ReportPeriod[],
  category: string | null,
): CategoryReport {
  const bars: TrendBar[] = periods.map((p) => ({
    key: p.key,
    label: p.label,
    value: periodValue(matrix.get(p.key), category),
    partial: p.partial,
  }));

  return {
    bars,
    total: bars.reduce((sum, b) => sum + b.value, 0),
    categories: category === null ? rankCategories(matrix) : [],
    rows: category === null ? [] : toRows(matrix, periods, category),
  };
}

function periodValue(
  byCategory: Map<string, { value: number; count: number }> | undefined,
  category: string | null,
): number {
  if (byCategory === undefined) return 0;
  if (category !== null) return byCategory.get(category)?.value ?? 0;
  let sum = 0;
  for (const v of byCategory.values()) sum += v.value;
  return sum;
}

// Ranked over the WHOLE window, not over one period. The list is the picker, so its figure has to be
// the one the report headline will show when you tap through — a row that promises ฿48,200 and lands
// on ฿3,100 is the bug this page exists to avoid.
function rankCategories(matrix: BreakdownMatrix): ReportCategory[] {
  const totals = new Map<string, { value: number; count: number }>();
  for (const byCategory of matrix.values())
    for (const [name, v] of byCategory) {
      const cur = totals.get(name) ?? { value: 0, count: 0 };
      totals.set(name, { value: cur.value + v.value, count: cur.count + v.count });
    }
  return [...totals.entries()]
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

// Filtered: one row per period, so the list decomposes the headline and sums to the chart above it.
// Periods with no spend are KEPT — "you bought none of this in 2019" is the answer, and dropping
// them would leave the list shorter than the chart still draws in full.
function toRows(
  matrix: BreakdownMatrix,
  periods: ReportPeriod[],
  category: string,
): ReportRow[] {
  return periods.map((p) => {
    const hit = matrix.get(p.key)?.get(category);
    return { key: p.key, label: p.label, value: hit?.value ?? 0, count: hit?.count ?? 0 };
  });
}
```

- [ ] **Step 5: Run the test and verify it passes**

```bash
npm test -- src/features/entries/category-report.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Switch `use-month.ts` onto the shared builder**

In `src/features/entries/use-month.ts`:

1. Replace the `getCategoryBreakdown` import with the shared builder. The current line 5 is:
   ```ts
   import { getCategoryBreakdown, getFirstExpenseDate } from './queries';
   ```
   becomes:
   ```ts
   import { getFirstExpenseDate } from './queries';
   import { buildBreakdownMatrix } from './breakdown-matrix';
   ```

2. Change the call site (currently `const matrix = await buildMatrix(db, cycles);`) to:
   ```ts
   const matrix = await buildBreakdownMatrix(db, cycles);
   ```

3. Delete the whole private `buildMatrix` function (currently lines 113–127) — the block starting `async function buildMatrix(` and ending with its closing `}`.

4. The `ponytail:` paragraph in the hook's header comment (currently lines 44–50) now describes code that lives elsewhere. Replace those seven comment lines with:
   ```ts
   // The per-window aggregate strategy and its ceiling are documented on buildBreakdownMatrix.
   ```

Leave everything else in the file untouched — `rankCategories`, `toYearRows` and `toDelta` stay as they are.

- [ ] **Step 7: Verify `/month` still works**

```bash
npm test -- src/features/entries/use-month.test.ts
```

Expected: PASS — every existing `useMonth` test, unchanged. This is the whole safety net for the extraction; if any fails, the builder's behaviour drifted and must be fixed before moving on.

- [ ] **Step 8: Run the gates**

```bash
npm run format:files src/features/entries/breakdown-matrix.ts src/features/entries/category-report.ts src/features/entries/category-report.test.ts src/features/entries/use-month.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass, full suite green.

- [ ] **Step 9: Commit**

```bash
git add src/features/entries/breakdown-matrix.ts src/features/entries/category-report.ts src/features/entries/category-report.test.ts src/features/entries/use-month.ts
git commit -m "feat(features): fold a breakdown matrix into a category report" -m "The category-over-time question needs the same key-to-category matrix /month already builds privately, so the builder moves to breakdown-matrix.ts rather than becoming a third copy. useMonth switches to it and its tests are the proof nothing drifted." -m "foldCategoryReport takes that matrix plus a labelled period list, which keeps it view-agnostic: monthly hands it cycles, yearly hands it years, and one fold serves both instead of two that can disagree."
```

---

### Task 2: The read hook

`useCategoryReport(view, year, category)` — resolve the window from the cutoff-aware cycle math, fetch the matrix, fold it, and return the display maps alongside.

**Files:**
- Create: `src/features/entries/use-category-report.ts`
- Create: `src/features/entries/use-category-report.test.ts`

**Interfaces:**
- Consumes: `buildBreakdownMatrix`, `BreakdownWindow` (Task 1); `foldCategoryReport`, `CategoryReport`, `ReportView`, `ReportPeriod` (Task 1); `cyclesInYear`, `currentCycleKey`, `firstTrackedYear`, `formatIsoRange` from `./cycle`; `monthLabel` from `./trend`; `getFirstExpenseDate` from `./queries`; `getCutoff`, `getIconSet`, `IconSet` from `@features/settings/queries`; `getEmojiMap`, `getHueMap` from `@features/categories/queries`; `withDb` from `@shared/db-effect`; `todayIso` from `@shared/date`; `useDataVersion` from `@shared/data-version`.
- Produces:
  - `type CategoryReportData = CategoryReport & { view: ReportView; year: number; currentYear: number; firstYear: number | null; rangeLabel: string; emojiMap: Record<string, string>; hueMap: Record<string, number>; iconSet: IconSet }`
  - `useCategoryReport(view: ReportView, year: number | null, category: string | null): { ready: boolean; data: CategoryReportData | null }`

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/use-category-report.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// The window anchors on "today" — which cycle is live, which year is current — so the clock has to
// be pinned or every expectation below drifts with the calendar.
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-20'),
}));

import { getBrowserDb } from '@db/browser';
import { useCategoryReport } from './use-category-report';

// Cutoff 18 is settings' DEFAULT_CUTOFF, so every date below (all on the 19th–25th) sits in the
// cycle keyed to its own month. On the pinned clock the live cycle is 2026-07.
//
// Year windows are cycle-aligned: 2026 runs 18 Jan 2026 → 17 Aug 2026 here (it stops at the live
// cycle), which is why 2026-01-20 lands in 2026 and not in 2025.
let db: Db;

describe('useCategoryReport', () => {
  beforeEach(async () => {
    db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
    await addEntries(db, [
      { date: '2024-07-20', account: 'Cash', category: 'Food', amount: -1000 },
      { date: '2025-03-20', account: 'Cash', category: 'Food', amount: -600 },
      { date: '2026-01-20', account: 'Cash', category: 'Food', amount: -1000 },
      { date: '2026-02-20', account: 'Cash', category: 'Travel', amount: -500 },
      // The live cycle — partial.
      { date: '2026-07-19', account: 'Cash', category: 'Food', amount: -300 },
      // Income never reaches a read surface.
      { date: '2026-01-21', account: 'Cash', category: 'Salary', amount: 50000 },
    ]);
  });

  it('monthly defaults to the current year and labels bars by month', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.year).toBe(2026);
    // cyclesInYear clips at the live cycle, so 2026 is seven cycles, not twelve.
    expect(result.current.data?.bars.map((b) => b.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
    ]);
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([1000, 500, 0, 0, 0, 0, 300]);
    expect(result.current.data?.bars.map((b) => b.partial)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(result.current.data?.total).toBe(1800);
  });

  it('monthly ranks the year’s categories for the picker list', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', 2026, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.categories).toEqual([
      { name: 'Food', value: 1300, count: 2 },
      { name: 'Travel', value: 500, count: 1 },
    ]);
  });

  it('monthly filtered decomposes the year, keeping empty months', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', 2026, 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(1300);
    expect(result.current.data?.rows.map((r) => [r.label, r.value, r.count])).toEqual([
      ['Jan', 1000, 1],
      ['Feb', 0, 0],
      ['Mar', 0, 0],
      ['Apr', 0, 0],
      ['May', 0, 0],
      ['Jun', 0, 0],
      ['Jul', 300, 1],
    ]);
  });

  it('clamps a ?year= outside the ledger’s span', async () => {
    const early = renderHook(() => useCategoryReport('monthly', 1999, null));
    await waitFor(() => expect(early.result.current.ready).toBe(true));
    expect(early.result.current.data?.year).toBe(2024);

    const late = renderHook(() => useCategoryReport('monthly', 2099, null));
    await waitFor(() => expect(late.result.current.ready).toBe(true));
    expect(late.result.current.data?.year).toBe(2026);
  });

  it('yearly spans every tracked year, one bar each, current year partial', async () => {
    const { result } = renderHook(() => useCategoryReport('yearly', null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars.map((b) => b.label)).toEqual(['2024', '2025', '2026']);
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([1000, 600, 1800]);
    expect(result.current.data?.bars.map((b) => b.partial)).toEqual([false, false, true]);
    expect(result.current.data?.total).toBe(3400);
  });

  it('yearly filtered reads one category down the years', async () => {
    const { result } = renderHook(() => useCategoryReport('yearly', null, 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.rows.map((r) => [r.label, r.value])).toEqual([
      ['2024', 1000],
      ['2025', 600],
      ['2026', 1300],
    ]);
  });

  it('reports an empty ledger as firstYear null', async () => {
    const empty = makeNodeProxyDb();
    await ensureEntriesTable(empty);
    await ensureSettingsTable(empty);
    vi.mocked(getBrowserDb).mockResolvedValue(empty);
    const { result } = renderHook(() => useCategoryReport('monthly', null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.firstYear).toBeNull();
    expect(result.current.data?.categories).toEqual([]);
  });

  it('refetches after a write', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', 2026, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(1800);

    await addEntries(db, [
      { date: '2026-04-20', account: 'Cash', category: 'Food', amount: -700 },
    ]);
    act(() => bumpDataVersion());
    await waitFor(() => expect(result.current.data?.total).toBe(2500));
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
npm test -- src/features/entries/use-category-report.test.ts
```

Expected: FAIL — `Failed to resolve import "./use-category-report"`.

- [ ] **Step 3: Write the hook**

Create `src/features/entries/use-category-report.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getFirstExpenseDate } from './queries';
import { buildBreakdownMatrix, type BreakdownWindow } from './breakdown-matrix';
import { cyclesInYear, currentCycleKey, firstTrackedYear, formatIsoRange } from './cycle';
import { monthLabel } from './trend';
import {
  foldCategoryReport,
  type CategoryReport,
  type ReportPeriod,
  type ReportView,
} from './category-report';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

export type CategoryReportData = CategoryReport & {
  view: ReportView;
  // The year actually shown — the requested one clamped into range, so a hand-typed ?year= cannot
  // strand the page on a window that could never hold data. Inert in the yearly view, but still
  // returned so the toggle can carry it back.
  year: number;
  // Bounds for the stepper. currentYear is the year of the CURRENT CYCLE, not of today: on 5 Jan the
  // live cycle is still last December's, so the newest reviewable year is that one.
  currentYear: number;
  firstYear: number | null;
  // The window's true span, e.g. '18 Jan – 26 Jul 2026'. Stated because a cutoff-based year does NOT
  // start on the 1st, and a page headed '2026' would quietly imply it does.
  rangeLabel: string;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// /report's data. The view decides the window AND the granularity together, which is what keeps the
// picker list and the chart describing the same span: monthly is one cycle-aligned year bucketed per
// cycle, yearly is every tracked year bucketed per year. Re-runs on ?view=/?year=/?category= change
// or after any write (useDataVersion).
export function useCategoryReport(
  view: ReportView,
  year: number | null,
  category: string | null,
): { ready: boolean; data: CategoryReportData | null } {
  const [data, setData] = useState<CategoryReportData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, firstDate, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getFirstExpenseDate(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
      ]);

      const today = todayIso();
      const currentKey = currentCycleKey(today, cutoff);
      const currentYear = Number(currentKey.split('-')[0]);
      const firstYear = firstTrackedYear(firstDate, cutoff);
      const activeYear = clamp(year ?? currentYear, firstYear ?? currentYear, currentYear);

      const { windows, periods } =
        view === 'yearly'
          ? yearlyWindow(firstYear, currentYear, currentKey, cutoff)
          : monthlyWindow(activeYear, currentKey, cutoff);

      const matrix = await buildBreakdownMatrix(db, windows);

      setData({
        ...foldCategoryReport(matrix, periods, category),
        view,
        year: activeYear,
        currentYear,
        firstYear,
        rangeLabel: toRangeLabel(windows, today),
        emojiMap,
        hueMap,
        iconSet,
      });
      setReady(true);
    });
  }, [view, year, category, version]);

  return { ready, data };
}

// NOT named `Window` — that shadows the DOM global and reads as the browser type at every use site.
type WindowSpec = { windows: BreakdownWindow[]; periods: ReportPeriod[] };

// One year, bucketed per cycle. cyclesInYear clips at the live cycle, so the current year is
// year-to-date rather than twelve bars with five empty ones on the end.
function monthlyWindow(year: number, currentKey: string, cutoff: number): WindowSpec {
  const cycles = cyclesInYear(year, currentKey, cutoff);
  return {
    windows: cycles,
    periods: cycles.map((c) => ({
      key: c.key,
      label: monthLabel(c.key),
      partial: c.key === currentKey,
    })),
  };
}

// Every tracked year, bucketed per year. A year's cycles are contiguous, so its whole span is ONE
// bounded range — N aggregates for N years, not twelve each. The bars are built as plain periods
// keyed by the year itself; TrendBar is not tied to a Cycle, so no synthetic cycles are needed.
function yearlyWindow(
  firstYear: number | null,
  currentYear: number,
  currentKey: string,
  cutoff: number,
): WindowSpec {
  if (firstYear === null) return { windows: [], periods: [] };
  const windows: BreakdownWindow[] = [];
  const periods: ReportPeriod[] = [];
  for (let y = firstYear; y <= currentYear; y++) {
    const cycles = cyclesInYear(y, currentKey, cutoff);
    if (cycles.length === 0) continue;
    const key = String(y);
    windows.push({ key, start: cycles[0].start, end: cycles[cycles.length - 1].end });
    periods.push({ key, label: key, partial: y === currentYear });
  }
  return { windows, periods };
}

// A window in progress is bounded by TODAY, not by its last cycle's end — that end is in the future,
// and labelling the span '18 Jan – 17 Aug' claims spend that cannot exist yet.
function toRangeLabel(windows: BreakdownWindow[], today: string): string {
  if (windows.length === 0) return '';
  const last = windows[windows.length - 1];
  return formatIsoRange(windows[0].start, last.end < today ? last.end : today);
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : max;
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
npm test -- src/features/entries/use-category-report.test.ts
```

Expected: PASS, 8 tests. If the yearly totals are off, check the year boundaries by hand: year `Y`'s window runs `cyclesInYear(Y)[0].start` (18 Jan Y) → its last cycle's `end`, which for a complete year is 17 Jan Y+1.

- [ ] **Step 5: Run the gates**

```bash
npm run format:files src/features/entries/use-category-report.ts src/features/entries/use-category-report.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/use-category-report.ts src/features/entries/use-category-report.test.ts
git commit -m "feat(features): read a category's spend over a year or over all years" -m "The view picks the window AND the granularity together — monthly is one cycle-aligned year bucketed per cycle, yearly is every tracked year bucketed per year. Tying them means the picker list and the chart always describe the same span, so the figure you tap is the headline you land on." -m "Yearly costs one aggregate per year, not twelve: a year's cycles are contiguous, so its whole span is a single bounded range."
```

---

### Task 3: The `/report` route and its doorway

The page itself — picker list, report, toggle, stepper — plus the More-sheet tile that reaches it.

**Files:**
- Create: `src/app/report/page.tsx`
- Modify: `src/shared/ui/MoreSheet.tsx` (add the tile to the `review` group)

**Interfaces:**
- Consumes: `useCategoryReport`, `CategoryReportData`, `ReportView` (Task 2); `ViewToggle` from `@shared/ui/ViewToggle` (**already exists — do not create it**); `PageContainer` from `@shared/ui/PageContainer`; `RowChevron` from `@shared/ui/Chevron`; `TrendChart`, `YearSelector`, `SwipeNav`, `HeaderFilterChip`, `EmptyLedger` from `@features/entries/ui/*`; `CategoryIcon` from `@features/categories/ui/CategoryIcon`; `emojiFor`, `hueFor` from `@features/categories/queries`; `trendAverage`, `completeBars` from `@features/entries/trend`; `formatBahtWhole` from `@shared/money`.
- Produces: the route `/report`, linked from the More sheet.

- [ ] **Step 1: Write the page**

Create `src/app/report/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { RowChevron } from '@shared/ui/Chevron';
import { ViewToggle } from '@shared/ui/ViewToggle';
import { useCategoryReport } from '@features/entries/use-category-report';
import type { ReportView } from '@features/entries/category-report';
import { trendAverage, completeBars } from '@features/entries/trend';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { YearSelector } from '@features/entries/ui/YearSelector';
import { SwipeNav } from '@features/entries/ui/SwipeNav';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBahtWhole } from '@shared/money';

// /report — pick a category, then watch it over time. The question is "what does this one thing cost
// me", which no other surface answers: Trends can scope a category but only across six cycles, /year
// holds a whole year but cannot scope one, and /categories leads to a flat records list.
//
// One route, two states, exactly as /month and /analytics work: no ?category= is the picker list,
// ?category= is that category's report, and the header chip clears back.
//
// The Monthly|Yearly toggle switches the WINDOW as well as the granularity (see use-category-report).
// That is the load-bearing decision here — it is why the number you tap in the list is the headline
// you land on.

function reportHref(view: ReportView, year: number, category: string | null): string {
  const params = new URLSearchParams();
  if (view === 'yearly') params.set('view', 'yearly');
  // Carried in BOTH views. Yearly ignores it — its window is every year on record — but keeping it
  // means toggling back to Monthly returns to the year you left rather than snapping to this one.
  params.set('year', String(year));
  if (category !== null) params.set('category', category);
  return `/report?${params.toString()}`;
}

export default function ReportPage() {
  const params = useSearchParams();
  const view: ReportView = params.get('view') === 'yearly' ? 'yearly' : 'monthly';
  const yearParam = Number(params.get('year'));
  // Junk or missing means "no opinion" — the hook then defaults to the current year and clamps
  // anything out of range, so nothing here has to guard the bounds.
  const year = Number.isInteger(yearParam) && yearParam > 0 ? yearParam : null;
  const category = params.get('category');
  const { ready, data } = useCategoryReport(view, year, category);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Category report</h1>
        <p className="p-8 text-center" style={{ color: 'var(--color-muted)' }}>
          …
        </p>
      </PageContainer>
    );
  }

  const {
    bars,
    total,
    categories,
    rows,
    year: activeYear,
    currentYear,
    firstYear,
    rangeLabel,
    emojiMap,
    hueMap,
    iconSet,
  } = data;

  // Only a ledger with nothing in it at all earns the onboarding screen. An empty YEAR is reachable
  // by stepping, and swapping the page there would both cry data loss and strand you — the stepper
  // is the only way back out.
  if (firstYear === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Category report</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  const heading = category ?? 'All spending';

  // Monthly steps through years. Yearly has nothing to step — its window IS every year — so the
  // stepper and the swipe both close, and computing both hrefs here once means the gesture and the
  // arrows can never disagree about what is reachable.
  const prevHref =
    view === 'monthly' && activeYear > firstYear
      ? reportHref('monthly', activeYear - 1, category)
      : null;
  const nextHref =
    view === 'monthly' && activeYear < currentYear
      ? reportHref('monthly', activeYear + 1, category)
      : null;

  const average = trendAverage(bars);
  // The average's real basis, NOT bars.length: trendAverage runs on completeBars, which drops the
  // live period and any period with no spend. A true mean under a false denominator is a lie.
  const averageBasis = completeBars(bars).length;
  const unit = view === 'monthly' ? 'month' : 'year';

  const chart = (
    <section className="panel flex flex-col gap-5 p-5">
      <header className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-base font-semibold">{heading}</h2>
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {rangeLabel}
          </span>
        </div>
        <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
      </header>

      {category !== null ? (
        <div className="flex min-w-0">
          <HeaderFilterChip href={reportHref(view, activeYear, null)} active label={category} />
        </div>
      ) : null}

      <ViewToggle
        options={[
          {
            label: 'Monthly',
            href: reportHref('monthly', activeYear, category),
            active: view === 'monthly',
          },
          {
            label: 'Yearly',
            href: reportHref('yearly', activeYear, category),
            active: view === 'yearly',
          },
        ]}
      />

      <TrendChart
        bars={bars}
        budget={null}
        label={`${heading} ${view === 'monthly' ? `month by month in ${activeYear}` : 'year by year'}`}
      />

      {/* Named because the chart's Average line is a figure without a basis — a reader sees the
          dashes but not what they average over, and that basis is most of the claim. */}
      {average === null ? null : (
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Averaging {formatBahtWhole(average)} across {averageBasis} completed{' '}
          {averageBasis === 1 ? unit : `${unit}s`}
        </span>
      )}
    </section>
  );

  // A year the ledger simply has nothing in. Reachable by stepping, so keep the stepper and say so
  // rather than drawing a chart of zeros under a ฿0 headline.
  const list =
    category !== null ? (
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          {view === 'monthly' ? `Every month in ${activeYear}` : 'Every year'}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) =>
            // A period with no spend is real data and stays in the list, but it is NOT a link: there
            // are no records behind it, and a 44px target that opens an empty view is a tap the
            // interface promised something for.
            r.count === 0 ? (
              <li
                key={r.key}
                className="flex min-h-11 items-baseline gap-1 text-sm"
                style={{ color: 'var(--color-faint)' }}
              >
                <span className="flex-1 truncate">{r.label}</span>
                <span className="tnum shrink-0">{formatBahtWhole(r.value)}</span>
              </li>
            ) : (
              <li key={r.key} className="flex items-center text-sm">
                <Link
                  prefetch={false}
                  // A month goes to its records. A YEAR goes to that year's months instead — /records
                  // has no year window, and drilling in is the more useful move anyway.
                  href={
                    view === 'monthly'
                      ? `/records?cycle=${r.key}&category=${encodeURIComponent(category)}`
                      : reportHref('monthly', Number(r.key), category)
                  }
                  aria-label={
                    view === 'monthly'
                      ? `${category} records for ${r.label} ${activeYear}`
                      : `${category} month by month in ${r.label}`
                  }
                  // min-h-11 for the 44px target: these rows carry no category disc to inherit it
                  // from (every row is the same category), so without it they collapse to text height.
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-1">
                    <span className="truncate">{r.label}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                      ({r.count})
                    </span>
                  </span>
                  <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
                    {formatBahtWhole(r.value)}
                  </span>
                  <RowChevron />
                </Link>
              </li>
            ),
          )}
        </ul>
      </section>
    ) : categories.length === 0 ? (
      <section className="panel px-6 py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing recorded in {activeYear}.
        </p>
      </section>
    ) : (
      // The picker. Its figures are the window's, so the row you tap and the headline you land on are
      // the same number.
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          {view === 'monthly' ? `Categories in ${activeYear}` : 'Categories, all time'}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {categories.map((c) => (
            <li key={c.name} className="flex items-center text-sm">
              <Link
                prefetch={false}
                href={reportHref(view, activeYear, c.name)}
                aria-label={`${c.name} over time`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <CategoryIcon
                  emoji={emojiFor(emojiMap, c.name)}
                  name={c.name}
                  hue={hueFor(hueMap, c.name)}
                  iconSet={iconSet}
                />
                <span className="flex min-w-0 flex-1 items-baseline gap-1">
                  <span className="truncate">{c.name}</span>
                  <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                    ({c.count})
                  </span>
                </span>
                <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
                  {formatBahtWhole(c.value)}
                </span>
                <RowChevron />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  const body = (
    <>
      {chart}
      {list}
    </>
  );

  return (
    <PageContainer size="full">
      <h1 className="sr-only">Category report</h1>
      {/* The stepper stays OUTSIDE SwipeNav — SwipeNav sets a transform even at rest, and a
          transformed ancestor would stop it sticking. */}
      {view === 'monthly' ? (
        <>
          <YearSelector year={activeYear} prevHref={prevHref} nextHref={nextHref} />
          <SwipeNav prevHref={prevHref} nextHref={nextHref} className="-mt-3 flex flex-col gap-6">
            {body}
          </SwipeNav>
        </>
      ) : (
        <div className="flex flex-col gap-6">{body}</div>
      )}
    </PageContainer>
  );
}
```

- [ ] **Step 2: Add the More-sheet tile**

In `src/shared/ui/MoreSheet.tsx`:

1. Add `PieChart` to the lucide import list (currently lines 6–15), keeping the list alphabetically as it is — append it after `CalendarClock`:
   ```ts
   import {
     Tags,
     Wallet,
     Plane,
     Repeat,
     Settings,
     Target,
     CalendarRange,
     CalendarClock,
     PieChart,
   } from 'lucide-react';
   ```

2. Add the tile to the `review` group, after `/month` and before `/trips`:
   ```ts
   // cycle: false — /report is keyed by ?year=/?view=, a window of its own choosing; a ?cycle=
   // tagging along would be inert noise in the URL.
   { href: '/report', label: 'Report', Icon: PieChart, cycle: false },
   ```

3. The header comment says "Eight tiles across three columns means one short row, and it is Plan's."
   That is now wrong — there are nine, and Review fills three full columns while Plan's short row is
   unchanged. Replace that sentence (currently lines 27–29) with:
   ```ts
   // Nine tiles across three columns: Review and Set up each fill a row, and the short row is Plan's.
   // That is why the captions earn their space — under a heading the gap reads as the end of a group,
   // and unlabelled it just reads as a hole.
   ```

- [ ] **Step 3: Run the gates**

```bash
npm run format:files src/app/report/page.tsx src/shared/ui/MoreSheet.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass. Typecheck is the real gate here — the page is the only untested code in the feature, and strict mode catches the destructuring and narrowing mistakes.

- [ ] **Step 4: Verify in a real browser at 412px**

```bash
npm run dev:web
```

Open `http://127.0.0.1:4010/report` at a 412px-wide viewport and walk this list. Tests run against the Node shim — they prove the fold and the queries and nothing about the worker, OPFS, or layout, so this step is not optional.

- [ ] The picker list renders, ranked biggest-first, each row with its icon and count.
- [ ] The year stepper is sticky under the header when you scroll.
- [ ] Tapping a category lands on its report, and **the headline equals the figure the row showed**.
- [ ] The chip (`✕ Food & Drink`) clears back to the list, keeping the year and view.
- [ ] Monthly → Yearly: the stepper disappears, bars become years, the list becomes "Every year" / "Categories, all time".
- [ ] Yearly → Monthly returns to the year you left, not to the current one.
- [ ] Tapping a year row in Yearly opens that year's Monthly view for the same category.
- [ ] Tapping a month row in Monthly opens `/records` filtered to that cycle and category.
- [ ] A month with no spend is muted and not tappable.
- [ ] Swiping left/right in Monthly steps the year; the swipe is dead at both bounds, matching the arrows.
- [ ] Step back to the ledger's first year and past it — the back arrow is disabled, not missing.
- [ ] The More sheet shows the **Report** tile under Review, and it opens `/report`.
- [ ] Nothing scrolls horizontally at 412px, including a long category name in the header chip.

- [ ] **Step 5: Commit**

```bash
git add src/app/report/page.tsx src/shared/ui/MoreSheet.tsx
git commit -m "feat(app): add /report — one category, seen over time" -m "Picking a category and asking what it costs had no home: Trends scopes a category but only over six cycles, /year holds a year but cannot scope one, and /categories leads to a flat records list. /report is one route with two states — the ranked picker, then that category's report." -m "The Monthly|Yearly toggle moves the window as well as the granularity, so the list and the chart always describe the same span and the figure you tap is the headline you land on. Reuses the existing shared ViewToggle rather than adding a second segmented control."
```

---

## Definition of done

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` all green.
- Every box in Task 3 Step 4 ticked in a real browser at 412px.
- Three commits on `feat/category-report`, one per task, on top of the spec commit.
- `/month` behaves exactly as before — the extraction in Task 1 is invisible to it.
