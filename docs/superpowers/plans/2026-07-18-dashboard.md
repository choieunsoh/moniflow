# Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/dashboard` route — a current-cycle overview with four forward-looking widgets (safe-to-spend/day, projected cycle total, this-cycle-vs-last, recent activity) — and give it the Analytics bottom-bar tab, moving Analytics into the More sheet.

**Architecture:** Follows the codebase's pure-core / hook-orchestration seam. A pure, DB-free `dashboard.ts` holds all the math (fully unit-tested); a `use-dashboard.ts` hook reads the browser OPFS db after mount and feeds the pure functions; a presentational `DashboardCards.tsx` renders. The page is a thin `'use client'` route like Home/Analytics. Navigation is a two-file swap in `BottomBar`/`MoreSheet`.

**Tech Stack:** Next.js 16 App Router (`output: 'export'`), React 19, TypeScript 5.9 strict, drizzle-orm over sqlite-proxy, Vitest + `@testing-library/react`, Tailwind v4.

## Global Constraints

- **TS bans (errors):** no `any`, no `as`, no `!`, no `@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`. `type` over `interface`. `for..of` over `forEach`. `as const` allowed.
- **Money formatters by provenance:** `formatBahtWhole` for computed glance figures (safe/day, projected, delta); `formatBaht` for stored amounts echoed back (recent-activity rows).
- **Dates via `Intl`** only; DB date keys are `YYYY-MM-DD`. Current cycle is reckoned in Asia/Bangkok via `todayIso()`.
- **Reads are async, post-mount.** Every hook returns `{ ready, data }`; the route shows a `…` placeholder until `ready`.
- **The dashboard is current-cycle only** — it does NOT read `?cycle=`.
- **Quality gates before each commit:** `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm test`. All must pass.
- **Commit format:** `type(scope): subject` with a WHY body; scopes here are `features` and `shared`. Use repeated `-m` flags (never `-F`/heredoc). End messages with the Co-Authored-By + Claude-Session trailers.

---

### Task 1: Pure dashboard math

**Files:**
- Create: `src/features/entries/dashboard.ts`
- Test: `src/features/entries/dashboard.test.ts`

**Interfaces:**
- Consumes: nothing (pure, stdlib only).
- Produces:
  - `MIN_PROJECT_DAYS: number` (= 3)
  - `safeToSpendPerDay(totalBudget: number | null, spent: number, daysLeft: number): number | null` — `null` when no budget set; `0` when over budget; otherwise `remaining / max(1, daysLeft)`.
  - `averagePerDay(spent: number, daysElapsed: number): number` — the no-budget fallback figure.
  - `projectCycleTotal(spent: number, daysElapsed: number, cycleLength: number): number | null` — `null` until `MIN_PROJECT_DAYS` elapsed.
  - `type CycleDelta = { delta: number; direction: 'up' | 'down' | 'same'; prevTotal: number }`
  - `cycleDelta(total: number, prevTotal: number | null): CycleDelta | null` — `null` when `prevTotal === null` (no comparable earlier cycle).

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/dashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  MIN_PROJECT_DAYS,
  safeToSpendPerDay,
  averagePerDay,
  projectCycleTotal,
  cycleDelta,
} from './dashboard';

describe('safeToSpendPerDay', () => {
  it('spreads the remaining budget over the days left', () => {
    // 3000 budget − 180 spent = 2820 remaining, over 29 days = ~97.24/day
    expect(safeToSpendPerDay(3000, 180, 29)).toBeCloseTo(2820 / 29);
  });

  it('returns null when no total budget is set (caller shows the average instead)', () => {
    expect(safeToSpendPerDay(null, 180, 29)).toBeNull();
  });

  it('floors at 0 when already over budget', () => {
    expect(safeToSpendPerDay(100, 250, 10)).toBe(0);
  });

  it('never divides by zero on the last day', () => {
    expect(safeToSpendPerDay(300, 100, 0)).toBe(200); // remaining spread over max(1,0)=1
  });
});

describe('averagePerDay', () => {
  it('is spent over elapsed days', () => {
    expect(averagePerDay(180, 3)).toBe(60);
  });

  it('guards day zero', () => {
    expect(averagePerDay(50, 0)).toBe(50);
  });
});

describe('projectCycleTotal', () => {
  it('extrapolates the current pace across the whole cycle', () => {
    // 180 over 3 days → 60/day × 31 = 1860
    expect(projectCycleTotal(180, 3, 31)).toBe(1860);
  });

  it('returns null before enough of the cycle has elapsed to project', () => {
    expect(projectCycleTotal(500, MIN_PROJECT_DAYS - 1, 31)).toBeNull();
  });
});

describe('cycleDelta', () => {
  it('reports the signed change vs last cycle with direction', () => {
    expect(cycleDelta(180, 200)).toEqual({ delta: -20, direction: 'down', prevTotal: 200 });
    expect(cycleDelta(250, 200)).toEqual({ delta: 50, direction: 'up', prevTotal: 200 });
    expect(cycleDelta(200, 200)).toEqual({ delta: 0, direction: 'same', prevTotal: 200 });
  });

  it('returns null when there is no comparable earlier cycle', () => {
    expect(cycleDelta(180, null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- dashboard.test.ts`
Expected: FAIL — `Failed to resolve import "./dashboard"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/features/entries/dashboard.ts`:

```ts
// Pure dashboard math — the /dashboard screen's forward-looking figures. No DB, no React, tested in
// isolation. All spend/budget inputs are magnitudes (≥ 0); the ledger stores outflow negative, so
// callers pass Math.abs.

// A single early expense over the first day or two projects a wild full-cycle number, so the
// projection stays null until this many days have elapsed. Tunable in one place.
export const MIN_PROJECT_DAYS = 3;

// Remaining budget spread over the days left in the cycle (today inclusive). null when no total
// budget is set — the caller shows the actual average instead, rather than inventing a safe number
// with nothing to divide against. Floors at 0 once you're over budget.
export function safeToSpendPerDay(
  totalBudget: number | null,
  spent: number,
  daysLeft: number,
): number | null {
  if (totalBudget === null) return null;
  const remaining = totalBudget - spent;
  if (remaining <= 0) return 0;
  return remaining / Math.max(1, daysLeft);
}

// Actual spend per elapsed day — the fallback figure shown when no total budget exists.
export function averagePerDay(spent: number, daysElapsed: number): number {
  return spent / Math.max(1, daysElapsed);
}

// Linear pace projection of the full-cycle total: current daily rate × the cycle's length. null
// until MIN_PROJECT_DAYS have elapsed (too little signal to project from).
export function projectCycleTotal(
  spent: number,
  daysElapsed: number,
  cycleLength: number,
): number | null {
  if (daysElapsed < MIN_PROJECT_DAYS) return null;
  return (spent / daysElapsed) * cycleLength;
}

export type CycleDelta = { delta: number; direction: 'up' | 'down' | 'same'; prevTotal: number };

// This cycle's spend vs the previous cycle's. null when prevTotal is null — the hook passes null when
// there is no comparable earlier cycle (a day-one ledger), matching the honesty Analytics already
// applies to thin history. delta > 0 means you're spending MORE than last cycle.
export function cycleDelta(total: number, prevTotal: number | null): CycleDelta | null {
  if (prevTotal === null) return null;
  const delta = total - prevTotal;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
  return { delta, direction, prevTotal };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- dashboard.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/dashboard.ts src/features/entries/dashboard.test.ts
npm run typecheck && npm run lint
git add src/features/entries/dashboard.ts src/features/entries/dashboard.test.ts
git commit -m "feat(features): pure dashboard math (safe-to-spend, projection, cycle delta)" -m "The forward-looking figures for the new /dashboard screen, as a DB-free tested core: remaining-budget-per-day (null when unbudgeted, 0 when over), average/day fallback, linear cycle-total projection (guarded until 3 days elapsed), and this-vs-last-cycle delta." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_013axLKXfwSHNxH7ex8oiVZo"
```

---

### Task 2: The `use-dashboard` read hook

**Files:**
- Create: `src/features/entries/use-dashboard.ts`
- Test: `src/features/entries/use-dashboard.test.ts`

**Interfaces:**
- Consumes (Task 1): `MIN_PROJECT_DAYS`, `safeToSpendPerDay`, `averagePerDay`, `projectCycleTotal`, `cycleDelta`, `CycleDelta`.
- Consumes (existing): `getBrowserDb` (`@db/browser`); `getCutoff`, `getIconSet`, `IconSet` (`@features/settings/queries`); `getEmojiMap`, `getHueMap` (`@features/categories/queries`); `getBudgets` (`@features/budgets/queries`); `getCycleSummary`, `getEntriesInRange` (`./queries`); `EntryRow` (`./schema`); `currentCycleKey`, `cycleFromKey`, `stepKey`, `cycleProgress`, `Cycle` (`./cycle`); `todayIso` (`@shared/date`); `useDataVersion` (`@shared/data-version`).
- Produces:
  - `type DashboardData = { cutoff: number; currentKey: string; cycle: Cycle; total: number; count: number; totalBudget: number | null; daysElapsed: number; daysLeft: number; cycleLength: number; safePerDay: number | null; avgPerDay: number; projected: number | null; delta: CycleDelta | null; recent: EntryRow[]; emojiMap: Record<string, string>; hueMap: Record<string, number>; iconSet: IconSet }`
  - `useDashboard(): { ready: boolean; data: DashboardData | null }`

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/use-dashboard.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { addEntries } from './queries';
import { setBudget } from '@features/budgets/queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// Fix "today" so the current-cycle math is deterministic. Cutoff 18 → 2026-07-20 is day 3 of the
// cycle keyed '2026-07' (2026-07-18 → 2026-08-17, 31 days). Keep the other date helpers real.
vi.mock('@shared/date', async (importActual) => ({
  ...(await importActual<typeof import('@shared/date')>()),
  todayIso: () => '2026-07-20',
}));

import { getBrowserDb } from '@db/browser';
import { useDashboard } from './use-dashboard';

describe('useDashboard', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureBudgetsTable(db);
    await addEntries(db, [
      // Current cycle '2026-07' (18 Jul → 17 Aug): 180 spent over 3 entries.
      { date: '2026-07-18', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-19', account: 'Cash', category: 'Food', amount: -50 },
      { date: '2026-07-20', account: 'Cash', category: 'Transport', amount: -30 },
      // Previous cycle '2026-06' (18 Jun → 17 Jul): 200 spent.
      { date: '2026-06-20', account: 'Cash', category: 'Food', amount: -200 },
    ]);
    await setBudget(db, null, 3000); // total budget
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('loads current-cycle figures, projection, and vs-last delta', async () => {
    const { result } = renderHook(() => useDashboard());
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — ready implies data');

    expect(data.currentKey).toBe('2026-07');
    expect(data.total).toBe(180);
    expect(data.count).toBe(3);
    expect(data.totalBudget).toBe(3000);
    expect(data.daysElapsed).toBe(3);
    expect(data.cycleLength).toBe(31);
    expect(data.daysLeft).toBe(29); // 31 − 3 + 1
    expect(data.safePerDay).toBeCloseTo(2820 / 29);
    expect(data.projected).toBe(1860); // 60/day × 31
    expect(data.delta).toEqual({ delta: -20, direction: 'down', prevTotal: 200 });
  });

  it('lists the current cycle recent entries, newest first, capped at 5', async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const recent = result.current.data?.recent ?? [];
    expect(recent).toHaveLength(3); // only the 3 current-cycle rows, not the June one
    expect(recent[0].date).toBe('2026-07-20');
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(180);

    const db = await getBrowserDb();
    await addEntries(db, [{ date: '2026-07-21', account: 'Cash', category: 'Food', amount: -20 }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.total).toBe(200));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- use-dashboard.test.ts`
Expected: FAIL — `Failed to resolve import "./use-dashboard"`.

- [ ] **Step 3: Write the implementation**

Create `src/features/entries/use-dashboard.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getCycleSummary, getEntriesInRange } from './queries';
import type { EntryRow } from './schema';
import { currentCycleKey, cycleFromKey, stepKey, cycleProgress, type Cycle } from './cycle';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { getBudgets } from '@features/budgets/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import {
  safeToSpendPerDay,
  averagePerDay,
  projectCycleTotal,
  cycleDelta,
  type CycleDelta,
} from './dashboard';

const RECENT_LIMIT = 5;

export type DashboardData = {
  cutoff: number;
  currentKey: string;
  cycle: Cycle;
  total: number; // magnitude spent this cycle
  count: number;
  totalBudget: number | null;
  daysElapsed: number;
  daysLeft: number;
  cycleLength: number;
  safePerDay: number | null;
  avgPerDay: number;
  projected: number | null;
  delta: CycleDelta | null;
  recent: EntryRow[];
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// The /dashboard screen's data — always the CURRENT cycle (no ?cycle= param): its safe-to-spend and
// projection figures need days remaining, which a past cycle doesn't have. Read once after mount,
// re-run on every data-version bump. Mirrors useHome's load pattern, but assembles the
// forward-looking figures instead of the donut.
export function useDashboard(): { ready: boolean; data: DashboardData | null } {
  const [data, setData] = useState<DashboardData | null>(null);
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
      const cycle = cycleFromKey(currentKey, cutoff);
      const prev = cycleFromKey(stepKey(currentKey, -1), cutoff);

      const [summary, prevSummary, entriesInCycle, budgetRows] = await Promise.all([
        getCycleSummary(db, cycle.start, cycle.end),
        getCycleSummary(db, prev.start, prev.end),
        getEntriesInRange(db, cycle.start, cycle.end),
        getBudgets(db),
      ]);

      const total = Math.abs(summary.outflow);
      const count = summary.count;
      // No entries in the prior cycle → no comparable history yet (null), rather than a misleading
      // "vs ฿0". A cycle you tracked nothing in isn't a baseline.
      const prevTotal = prevSummary.count > 0 ? Math.abs(prevSummary.outflow) : null;
      const totalBudget = budgetRows.find((b) => b.category === null)?.amount ?? null;

      const progress = cycleProgress(cycle, todayIso());
      const daysElapsed = progress.day;
      const cycleLength = progress.total;
      const daysLeft = cycleLength - daysElapsed + 1; // today inclusive

      // Newest first; id (autoincrement) breaks ties within a day. Slice in JS — a cycle is ~a month
      // of rows, far too few to warrant a dedicated LIMIT query.
      const recent = [...entriesInCycle]
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        .slice(0, RECENT_LIMIT);

      setData({
        cutoff,
        currentKey,
        cycle,
        total,
        count,
        totalBudget,
        daysElapsed,
        daysLeft,
        cycleLength,
        safePerDay: safeToSpendPerDay(totalBudget, total, daysLeft),
        avgPerDay: averagePerDay(total, daysElapsed),
        projected: projectCycleTotal(total, daysElapsed, cycleLength),
        delta: cycleDelta(total, prevTotal),
        recent,
        emojiMap,
        hueMap,
        iconSet,
      });
      setReady(true);
    })();
  }, [version]);

  return { ready, data };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- use-dashboard.test.ts`
Expected: PASS (3 cases green).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/use-dashboard.ts src/features/entries/use-dashboard.test.ts
npm run typecheck && npm run lint
git add src/features/entries/use-dashboard.ts src/features/entries/use-dashboard.test.ts
git commit -m "feat(features): useDashboard read hook for the current-cycle overview" -m "Assembles the current cycle's forward-looking figures from the browser db: total vs total budget, days elapsed/left, safe-to-spend and average per day, pace projection, this-vs-last-cycle delta (null when the prior cycle is empty), and the 5 newest entries. No ?cycle= — the screen is always the current cycle. Refetches on data-version bumps like the other read hooks." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_013axLKXfwSHNxH7ex8oiVZo"
```

---

### Task 3: DashboardCards UI

**Files:**
- Create: `src/features/entries/ui/DashboardCards.tsx`

**Interfaces:**
- Consumes (Task 2): `DashboardData`.
- Consumes (existing): `formatBaht`, `formatBahtWhole` (`@shared/money`); `CategoryIcon` (`@features/categories/ui/CategoryIcon`); `emojiFor`, `hueFor` (`@features/categories/queries`); `formatDayHeading` (`@shared/date`); `Link` (`next/link`).
- Produces: `DashboardCards({ data }: { data: DashboardData }): JSX.Element` — the four stacked `.panel` cards.

Presentational only; all logic is in the tested `dashboard.ts`, so no test file. Verified in the browser in Task 6.

- [ ] **Step 1: Write the component**

Create `src/features/entries/ui/DashboardCards.tsx`:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DashboardData } from '../use-dashboard';
import { formatBaht, formatBahtWhole } from '@shared/money';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatDayHeading } from '@shared/date';

// The four current-cycle overview cards, stacked. Big glance figures use formatBahtWhole (computed);
// recent-activity rows echo stored amounts with formatBaht (exact). All the decisions (null vs 0 vs
// number) are made upstream in the pure dashboard math — this file only renders.
export function DashboardCards({ data }: { data: DashboardData }) {
  return (
    <div className="flex flex-col gap-4">
      <SafeToSpendCard
        safePerDay={data.safePerDay}
        avgPerDay={data.avgPerDay}
        daysLeft={data.daysLeft}
      />
      <ProjectedCard projected={data.projected} totalBudget={data.totalBudget} />
      <VsLastCard delta={data.delta} />
      <RecentCard
        recent={data.recent}
        emojiMap={data.emojiMap}
        hueMap={data.hueMap}
        iconSet={data.iconSet}
      />
    </div>
  );
}

function CardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// safePerDay === null → no budget set: show the actual average + a link to set one. === 0 → over
// budget. Otherwise the per-day allowance.
function SafeToSpendCard({
  safePerDay,
  avgPerDay,
  daysLeft,
}: {
  safePerDay: number | null;
  avgPerDay: number;
  daysLeft: number;
}) {
  if (safePerDay === null) {
    return (
      <CardShell title="Average / day so far">
        <span className="tnum text-2xl font-semibold">{formatBahtWhole(avgPerDay)}</span>
        <Link
          href="/budgets"
          prefetch={false}
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Set a total budget for a safe-to-spend figure →
        </Link>
      </CardShell>
    );
  }
  if (safePerDay === 0) {
    return (
      <CardShell title="Safe to spend / day">
        <span className="tnum text-2xl font-semibold" style={{ color: 'var(--color-loss)' }}>
          {formatBahtWhole(0)}
        </span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing left in this cycle's budget
        </span>
      </CardShell>
    );
  }
  return (
    <CardShell title="Safe to spend / day">
      <span className="tnum text-2xl font-semibold">{formatBahtWhole(safePerDay)}</span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        over {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
      </span>
    </CardShell>
  );
}

// projected === null → too early to project. With a budget, show whether the pace lands over/under.
function ProjectedCard({
  projected,
  totalBudget,
}: {
  projected: number | null;
  totalBudget: number | null;
}) {
  if (projected === null) {
    return (
      <CardShell title="Projected this cycle">
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Too early to project — check back in a few days
        </span>
      </CardShell>
    );
  }
  const over = totalBudget !== null && projected > totalBudget;
  return (
    <CardShell title="Projected this cycle">
      <span className="tnum text-2xl font-semibold">{formatBahtWhole(projected)}</span>
      {totalBudget !== null ? (
        <span
          className="text-sm"
          style={{ color: over ? 'var(--color-loss)' : 'var(--color-muted)' }}
        >
          {over
            ? `${formatBahtWhole(projected - totalBudget)} over budget at this pace`
            : 'on track for your budget'}
        </span>
      ) : null}
    </CardShell>
  );
}

// delta === null → no comparable earlier cycle. up = spending more (loss red), down = less (accent).
function VsLastCard({ delta }: { delta: DashboardData['delta'] }) {
  if (delta === null) {
    return (
      <CardShell title="This cycle vs last">
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No comparable earlier cycle yet
        </span>
      </CardShell>
    );
  }
  if (delta.direction === 'same') {
    return (
      <CardShell title="This cycle vs last">
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Same as last cycle
        </span>
      </CardShell>
    );
  }
  const up = delta.direction === 'up';
  const color = up ? 'var(--color-loss)' : 'var(--color-accent-text)';
  return (
    <CardShell title="This cycle vs last">
      <span className="tnum text-2xl font-semibold" style={{ color }}>
        {up ? '↑' : '↓'} {formatBahtWhole(Math.abs(delta.delta))}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {up ? 'more than' : 'less than'} last cycle ({formatBahtWhole(delta.prevTotal)})
      </span>
    </CardShell>
  );
}

function RecentCard({
  recent,
  emojiMap,
  hueMap,
  iconSet,
}: {
  recent: DashboardData['recent'];
  emojiMap: DashboardData['emojiMap'];
  hueMap: DashboardData['hueMap'];
  iconSet: DashboardData['iconSet'];
}) {
  return (
    <CardShell title="Recent activity">
      <ul className="flex flex-col gap-2.5">
        {recent.map((e) => (
          <li key={e.id}>
            <Link
              prefetch={false}
              href="/records"
              aria-label={`${e.category} ${formatBaht(Math.abs(e.amount))} on ${formatDayHeading(e.date)}`}
              className="flex min-h-11 items-center gap-3 text-sm"
            >
              <CategoryIcon
                emoji={emojiFor(emojiMap, e.category)}
                name={e.category}
                hue={hueFor(hueMap, e.category)}
                iconSet={iconSet}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{e.note ? e.note : e.category}</span>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {formatDayHeading(e.date)}
                </span>
              </span>
              <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                {formatBaht(Math.abs(e.amount))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run format:files src/features/entries/ui/DashboardCards.tsx && npm run typecheck && npm run lint`
Expected: PASS (no `any`/`as`/`!`; all imports resolve).

- [ ] **Step 3: Commit**

```bash
git add src/features/entries/ui/DashboardCards.tsx
git commit -m "feat(features): DashboardCards — the four overview cards" -m "Presentational stack for /dashboard: safe-to-spend/day (with the no-budget average fallback and over-budget state), projected cycle total vs budget, this-vs-last-cycle delta (up=red/down=green), and a recent-activity feed reusing CategoryIcon. All branch logic lives in the tested dashboard.ts; this file only renders." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_013axLKXfwSHNxH7ex8oiVZo"
```

---

### Task 4: The `/dashboard` route

**Files:**
- Create: `src/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useDashboard` (Task 2), `DashboardCards` (Task 3); `PageContainer` (`@shared/ui/PageContainer`), `EmptyLedger` (`@features/entries/ui/EmptyLedger`).
- Produces: the default-exported `DashboardPage` route component.

- [ ] **Step 1: Write the page**

Create `src/app/dashboard/page.tsx`:

```tsx
'use client';

import { PageContainer } from '@shared/ui/PageContainer';
import { useDashboard } from '@features/entries/use-dashboard';
import { DashboardCards } from '@features/entries/ui/DashboardCards';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Dashboard = the current-cycle overview. Home answers "what did I spend this cycle"; Analytics "is
// that normal for me"; this answers "where is this cycle heading, and can I still afford the rest of
// it". Always the current cycle (no ?cycle=), loaded client-side via useDashboard against the browser
// OPFS db.
export default function DashboardPage() {
  const { ready, data } = useDashboard();

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div
          role="status"
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  // No spend this cycle — reuse the shared empty state (points at the keypad / CSV restore) rather
  // than rendering four blank cards, matching Analytics' choice.
  if (data.count === 0) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Dashboard</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  return (
    <PageContainer size="full">
      {/* sr-only heading root — the visible headings are the card <h2>s, so without this the heading
          list has no <h1>. Matches Home/Records/Analytics. */}
      <h1 className="sr-only">Dashboard</h1>
      <DashboardCards data={data} />
    </PageContainer>
  );
}
```

- [ ] **Step 2: Verify it builds and typechecks**

Run: `npm run format:files src/app/dashboard/page.tsx && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Verify the static export produces the route**

Run: `npm run build:web`
Expected: build succeeds and the output lists a `/dashboard` route (a `dashboard` entry under `out/` / the route table).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(app): /dashboard current-cycle overview route" -m "Thin 'use client' route: loading placeholder → useDashboard → DashboardCards, with the shared EmptyLedger when the cycle has no spend. Always the current cycle, no ?cycle= param." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_013axLKXfwSHNxH7ex8oiVZo"
```

---

### Task 5: Navigation — Dashboard takes the Analytics tab

**Files:**
- Modify: `src/shared/ui/BottomBar.tsx` (the Analytics `BarTab` ~line 52-57; the `AnalyticsIcon` function ~line 205-216)
- Modify: `src/shared/ui/MoreSheet.tsx` (the `LINKS` array ~line 15-22; the lucide import ~line 6)

**Interfaces:**
- Consumes: the existing `/dashboard` route (Task 4), `isActivePath` (already handles any prefix route — no change needed there), the existing `cycleHref` / `cycle: true` MoreSheet mechanism.
- Produces: no new exports — a tab swap.

- [ ] **Step 1: Swap the bottom-bar tab**

In `src/shared/ui/BottomBar.tsx`, replace the Analytics `BarTab` (the block rendering `href={cycleHref('/analytics', cycle)}` … `icon={<AnalyticsIcon />}`) with a bare Dashboard tab:

```tsx
          <BarTab
            href="/dashboard"
            label="Dashboard"
            active={isActivePath(pathname, '/dashboard')}
            icon={<DashboardIcon />}
          />
```

(Bare `/dashboard` — no `cycleHref` — because the dashboard is always the current cycle.)

- [ ] **Step 2: Replace the icon**

In `src/shared/ui/BottomBar.tsx`, replace the `AnalyticsIcon` function with a `DashboardIcon` (a gauge — reads as "at-a-glance status", distinct from the Analytics bars and the More grid):

```tsx
// Dashboard = the current-cycle "where am I heading" overview — a gauge/dial reads as an at-a-glance
// status check, distinct from Analytics' trend bars (now in the More sheet) and the More grid.
function DashboardIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 11a5.5 5.5 0 1 1 11 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M8 8.5 10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 3: Add Analytics to the More sheet**

In `src/shared/ui/MoreSheet.tsx`, add `LineChart` to the lucide import and prepend an Analytics entry to `LINKS` (it reads `?cycle=`, so `cycle: true`):

Change the import line:

```tsx
import { Tags, Wallet, Plane, Repeat, Settings, Target, LineChart } from 'lucide-react';
```

And the `LINKS` array (add the first entry):

```tsx
const LINKS = [
  { href: '/analytics', label: 'Analytics', Icon: LineChart, cycle: true },
  { href: '/budgets', label: 'Budgets', Icon: Target, cycle: true },
  { href: '/categories', label: 'Categories', Icon: Tags, cycle: false },
  { href: '/accounts', label: 'Accounts', Icon: Wallet, cycle: false },
  { href: '/trips', label: 'Trips', Icon: Plane, cycle: false },
  { href: '/recurring', label: 'Recurring', Icon: Repeat, cycle: false },
  { href: '/settings', label: 'Settings', Icon: Settings, cycle: false },
] as const;
```

- [ ] **Step 4: Typecheck + lint (catches the now-unused AnalyticsIcon)**

Run: `npm run format:files src/shared/ui/BottomBar.tsx src/shared/ui/MoreSheet.tsx && npm run typecheck && npm run lint`
Expected: PASS. If lint flags an unused `AnalyticsIcon`, you missed deleting it in Step 2 — remove it.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/BottomBar.tsx src/shared/ui/MoreSheet.tsx
git commit -m "feat(shared): Dashboard takes the Analytics tab; Analytics moves to More" -m "The bottom bar's fifth slot becomes Dashboard (bare href — it's always the current cycle) with a gauge glyph. Analytics joins the More sheet grid with cycle:true, exactly as Budgets did when it was demoted. Home is untouched." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_013axLKXfwSHNxH7ex8oiVZo"
```

---

### Task 6: Full quality gates + browser verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole gate suite**

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```
Expected: all green (the new `dashboard.test.ts` + `use-dashboard.test.ts` included).

- [ ] **Step 2: Drive it in a browser at 412px**

Run: `npm run dev:web` and open `http://127.0.0.1:4010/dashboard` at a 412px width. Confirm:
- The bottom bar shows **Dashboard** in the old Analytics slot; tapping it highlights the tab.
- **More** now lists **Analytics**, and tapping it opens `/analytics` with the cycle preserved.
- With a seeded ledger: the four cards render — safe-to-spend/day (or the average fallback when no total budget is set in Budgets), projected total, vs-last, and recent activity newest-first.
- Set a total budget in Budgets → the safe-to-spend card switches from the average fallback to a per-day figure; overspend it → it shows ฿0 / "nothing left".
- An empty cycle (navigate a fresh origin, or clear entries) shows the `EmptyLedger`, not blank cards.

- [ ] **Step 3: Confirm and report**

Report the gate output and what you observed in the browser. No commit (verification only). If anything failed, fix under the relevant task and re-run.

---

## Notes

- **`active-path.ts` needs no change** — `isActivePath(pathname, '/dashboard')` already works via its prefix branch. (The spec listed it as a possible edit; it isn't one.)
- **No schema change** — the dashboard is read-only over existing tables, so `worker.ts` `BOOTSTRAP_SQL` and the `schema.ts` files are untouched.
- **`todayIso` is mocked** in the hook test (partial mock, other date helpers stay real) so the current-cycle math is deterministic.
