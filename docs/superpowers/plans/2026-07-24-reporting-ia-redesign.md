# Reporting IA Redesign — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the `/dashboard` screen into Home (`/`), promote Analytics to a bottom-bar tab relabeled "Trends", move the this-vs-last-cycle card onto Trends, and delete the now-dead `/dashboard` route.

**Architecture:** Two reporting surfaces instead of three. `useHome` grows a nullable `forward` block (safe-to-spend, projection, upcoming bills) computed for the current cycle only; Home renders the two forward cards below its headline. `useAnalytics` grows a `delta` field derived from its own trend bars; the Trends page renders it as a card. The old dashboard's forward cards are *moved* (not rewritten) into new files; its Recent-activity and wrapper are deleted. Nav swaps the Dashboard tab for a Trends tab and drops Analytics from the More sheet.

**Tech Stack:** Next.js 16 App Router (static export, all `'use client'`), React 19, TypeScript 5.9 strict, Tailwind v4, Vitest + `@testing-library/react` (`renderHook`), SQLite-wasm/OPFS in the browser with a better-sqlite3 node-proxy shim for tests.

## Global Constraints

- **Offline / no server / single-user / spending-only (outflows).** Add no income, sync, or backend.
- **TS bans (enforced as ESLint errors):** no `any`, no `as`, no `!`, no `@ts-*` comments; `type` over `interface`; `for..of` over `forEach`; `as const`/`satisfies` where a literal/contract applies.
- **Money formatters by provenance:** `formatBahtWhole` for computed glance figures, `formatBaht` for stored amounts. Digits use `tnum` (tabular-nums) — no monospace font.
- **Reads are async, post-mount.** Every read hook returns `{ ready, data }`; the route shows a skeleton until `ready`.
- **`?cycle=` anchors the page to the selected cycle.** Forward-looking figures make sense only for the current cycle.
- **Quality gates before every commit** (run separately so failures surface individually):
  `npm run format:files <changed files>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`.
- **Commit format:** `type(scope): subject` with repeated `-m` flags for subject + body; scopes here are `features` and `app`. No `Claude-Session:` trailer.
- **Verify at 412px in a browser** after Task 4 — tests exercise the node shim, never layout.

---

### Task 1: `useHome` grows a `forward` block

Add the former dashboard's forward-looking figures to the Home hook, computed only when the active cycle is the current one.

**Files:**
- Modify: `src/features/entries/use-home.ts`
- Test: `src/features/entries/use-home.test.ts`

**Interfaces:**
- Consumes (all already exported): `safeToSpendPerDay(totalBudget, spent, committed, daysLeft)`, `averagePerDay(spent, daysElapsed)`, `projectCycleTotal(spent, daysElapsed, cycleLength)`, `MIN_PROJECT_DAYS` from `./dashboard`; `listRules(db)` from `@features/recurring/queries`; `committedThisCycle(rules, todayIso, cycleEnd) → Committed` from `@features/recurring/upcoming`.
- Produces: `type HomeForward = { safePerDay: number | null; avgPerDay: number; projected: number | null; daysLeft: number; upcoming: Committed }` and a new field `forward: HomeForward | null` on `HomeData`.

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `src/features/entries/use-home.test.ts` (the file already imports `renderHook, waitFor`, mocks `@db/browser` and `todayIso`, and its `beforeEach` seeds three entries totaling 170 in cycle `2026-06` with default cutoff 18). Add `setBudget` to the imports at the top of the file:

```ts
import { setBudget } from '@features/budgets/queries';
```

```ts
describe('forward (current-cycle figures folded in from the old dashboard)', () => {
  it('carries safe-to-spend, projection and upcoming for the current cycle', async () => {
    vi.mocked(todayIso).mockReturnValue('2026-06-22'); // day 5 of the current cycle '2026-06'
    const db = await getBrowserDb();
    await setBudget(db, null, 3000); // total budget

    const { result } = renderHook(() => useHome(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — ready implies data');

    expect(data.isCurrentCycle).toBe(true);
    expect(data.forward).not.toBeNull();
    const f = data.forward;
    if (f === null) throw new Error('unreachable — asserted non-null above');
    expect(f.avgPerDay).toBeCloseTo(170 / 5); // 170 spent over 5 elapsed days
    expect(f.projected).toBeCloseTo((170 / 5) * data.progress.total);
    expect(f.daysLeft).toBe(data.progress.total - 5 + 1); // today inclusive
    expect(f.safePerDay).toBeCloseTo((3000 - 170) / f.daysLeft);
    expect(f.upcoming).toEqual({ total: 0, count: 0 }); // no recurring rules seeded
  });

  it('is null on a past cycle — nothing to look ahead to', async () => {
    vi.mocked(todayIso).mockReturnValue('2026-08-01'); // makes '2026-07' current, so '2026-06' is past
    const { result } = renderHook(() => useHome('2026-06'));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.data?.isCurrentCycle).toBe(false);
    expect(result.current.data?.forward).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- use-home`
Expected: FAIL — the `forward` property does not exist on `HomeData` (type error) / is `undefined` at runtime.

- [ ] **Step 3: Implement the `forward` block**

In `src/features/entries/use-home.ts`:

Extend the existing `./dashboard` import to add the three functions (it currently imports only `MIN_PROJECT_DAYS`):

```ts
import {
  safeToSpendPerDay,
  averagePerDay,
  projectCycleTotal,
  MIN_PROJECT_DAYS,
} from './dashboard';
```

Add the recurring imports (mirroring `use-dashboard.ts`):

```ts
import { listRules } from '@features/recurring/queries';
import { committedThisCycle, type Committed } from '@features/recurring/upcoming';
```

Add the type above `HomeData` and the field on it:

```ts
// The current cycle's forward-looking figures, folded in from the former /dashboard screen. Present
// only when the cycle on screen is the current one — safe-to-spend and a projection only mean
// something looking AHEAD, so a past cycle carries null and the page hides them, leaving the donut.
export type HomeForward = {
  safePerDay: number | null;
  avgPerDay: number;
  projected: number | null;
  daysLeft: number;
  upcoming: Committed;
};
```

Add `forward: HomeForward | null;` to the `HomeData` type (place it right after `showPace: boolean;`).

In the effect, after `showPace` is computed (it already has `progress`, `total`, `totalLimit`, `isCurrentCycle`, `cycle` in scope) and before the `ledgerEmpty` line, insert:

```ts
// Forward figures for the current cycle only. listRules is fetched here (not in the top Promise.all)
// so a past cycle — the common case when paging back — never pays for it.
let forward: HomeForward | null = null;
if (isCurrentCycle) {
  const rules = await listRules(db);
  const daysLeft = progress.total - progress.day + 1; // today inclusive
  const upcoming = committedThisCycle(rules, todayIso(), cycle.end);
  forward = {
    safePerDay: safeToSpendPerDay(totalLimit, total, upcoming.total, daysLeft),
    avgPerDay: averagePerDay(total, progress.day),
    projected: projectCycleTotal(total, progress.day, progress.total),
    daysLeft,
    upcoming,
  };
}
```

Add `forward,` to the `setData({ ... })` object (after `showPace,`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- use-home`
Expected: PASS (all existing `useHome` tests still green — `forward` is additive).

- [ ] **Step 5: Format, gate, commit**

```bash
npm run format:files src/features/entries/use-home.ts src/features/entries/use-home.test.ts
npm run typecheck && npm run lint && npm test -- use-home
git add src/features/entries/use-home.ts src/features/entries/use-home.test.ts
git commit -m "feat(features): fold current-cycle forward figures into useHome" -m "safe-to-spend, projection and upcoming bills — the former /dashboard figures — now ride on HomeData.forward, computed for the current cycle only (null on a past cycle). Prepares the Home+Dashboard merge."
```

---

### Task 2: Merge Dashboard into Home; delete the `/dashboard` route

Move the two forward cards out of the doomed `DashboardCards.tsx` into their own files, render them on Home, and delete every dashboard-only file.

**Files:**
- Create: `src/features/entries/ui/ForwardCards.tsx`
- Create: `src/features/entries/ui/CycleDeltaCard.tsx`
- Modify: `src/app/page.tsx`
- Delete: `src/app/dashboard/page.tsx`, `src/features/entries/use-dashboard.ts`, `src/features/entries/use-dashboard.test.ts`, `src/features/entries/ui/DashboardCards.tsx`, `src/features/entries/ui/DashboardSkeleton.tsx`

**Interfaces:**
- Consumes: `HomeData.forward` (Task 1); `CycleDelta` from `./dashboard` (for `CycleDeltaCard`, wired in Task 3).
- Produces: `SafeToSpendCard`, `ProjectedCard` (from `ForwardCards.tsx`); `CycleDeltaCard` (from `CycleDeltaCard.tsx`, consumed in Task 3).

> Note: `dashboard.ts` and `dashboard.test.ts` STAY — they hold the pure math (`safeToSpendPerDay`, `projectCycleTotal`, `cycleDelta`, …) that `useHome` and `useAnalytics` still use. Only the `use-dashboard` hook and the dashboard UI files are deleted.

- [ ] **Step 1: Create `ForwardCards.tsx`**

Create `src/features/entries/ui/ForwardCards.tsx` — `CardShell`, `UpcomingLine`, `SafeToSpendCard`, `ProjectedCard` moved verbatim from `DashboardCards.tsx`, retyped against `HomeForward` instead of `DashboardData`:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HomeForward } from '../use-home';
import { formatBahtWhole } from '@shared/money';

// The current-cycle forward cards, moved out of the former DashboardCards so Home can render them
// under its headline. All the null/0/number decisions are made upstream in the pure dashboard math
// (see dashboard.ts) — these components only render.

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

// The upcoming-bills sub-line, shared by all three Safe-to-spend variants so the phrasing and the
// singular/plural rule live in one place. Renders nothing when nothing is due.
function UpcomingLine({ upcoming }: { upcoming: HomeForward['upcoming'] }) {
  if (upcoming.count === 0) return null;
  return (
    <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
      Upcoming: {formatBahtWhole(upcoming.total)} · {upcoming.count}{' '}
      {upcoming.count === 1 ? 'bill' : 'bills'} due
    </span>
  );
}

// safePerDay === null → no budget set: show the actual average + a link to set one. === 0 → over
// budget. Otherwise the per-day allowance.
export function SafeToSpendCard({
  safePerDay,
  avgPerDay,
  daysLeft,
  upcoming,
}: {
  safePerDay: number | null;
  avgPerDay: number;
  daysLeft: number;
  upcoming: HomeForward['upcoming'];
}) {
  if (safePerDay === null) {
    return (
      <CardShell title="Average / day so far">
        <span className="tnum text-4xl font-semibold">{formatBahtWhole(avgPerDay)}</span>
        <Link
          href="/budgets"
          prefetch={false}
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Set a total budget for a safe-to-spend figure →
        </Link>
        {upcoming.count > 0 ? (
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Upcoming: {formatBahtWhole(upcoming.total)} · {upcoming.count}{' '}
            {upcoming.count === 1 ? 'bill' : 'bills'} due
          </span>
        ) : null}
      </CardShell>
    );
  }
  if (safePerDay === 0) {
    return (
      <CardShell title="Safe to spend / day">
        <span className="tnum text-4xl font-semibold" style={{ color: 'var(--color-loss)' }}>
          {formatBahtWhole(0)}
        </span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing left in this cycle's budget
        </span>
        {upcoming.count > 0 ? (
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Upcoming: {formatBahtWhole(upcoming.total)} · {upcoming.count}{' '}
            {upcoming.count === 1 ? 'bill' : 'bills'} due
          </span>
        ) : null}
      </CardShell>
    );
  }
  return (
    <CardShell title="Safe to spend / day">
      <span className="tnum text-4xl font-semibold">{formatBahtWhole(safePerDay)}</span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        over {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
      </span>
      <UpcomingLine upcoming={upcoming} />
    </CardShell>
  );
}

// projected === null → too early to project. With a budget, show whether the pace lands over/under.
export function ProjectedCard({
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
```

- [ ] **Step 2: Create `CycleDeltaCard.tsx`**

Create `src/features/entries/ui/CycleDeltaCard.tsx` — the former `VsLastCard`, standalone (it renders on Trends in Task 3):

```tsx
import type { CycleDelta } from '../dashboard';
import { formatBahtWhole } from '@shared/money';

// "This cycle vs last" — moved off the /dashboard screen onto Trends, where a cross-cycle comparison
// belongs. delta === null → no comparable earlier cycle. up = spending more (loss red), down = less.
export function CycleDeltaCard({ delta }: { delta: CycleDelta | null }) {
  if (delta === null) {
    return (
      <section className="panel flex flex-col gap-2 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          This cycle vs last
        </h2>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No comparable earlier cycle yet
        </span>
      </section>
    );
  }
  if (delta.direction === 'same') {
    return (
      <section className="panel flex flex-col gap-2 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          This cycle vs last
        </h2>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Same as last cycle
        </span>
      </section>
    );
  }
  const up = delta.direction === 'up';
  const color = up ? 'var(--color-loss)' : 'var(--color-accent-text)';
  return (
    <section className="panel flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        This cycle vs last
      </h2>
      <span className="tnum text-2xl font-semibold" style={{ color }}>
        {up ? '↑' : '↓'} {formatBahtWhole(Math.abs(delta.delta))}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {up ? 'more than' : 'less than'} last cycle ({formatBahtWhole(delta.prevTotal)})
      </span>
    </section>
  );
}
```

- [ ] **Step 3: Render the forward cards on Home**

In `src/app/page.tsx`:

Add the import near the other feature-ui imports:

```tsx
import { SafeToSpendCard, ProjectedCard } from '@features/entries/ui/ForwardCards';
```

Add `forward` to the destructure of `data` (the block starting `const { cutoff, activeKey, ... } = data;`) — add `forward,` alongside `totalStatus`.

Render the cards immediately after the headline `</section>` (the panel closing at the "Spent this cycle" block, currently just before `<ViewToggle .../>`), inside the `hasSpending` branch:

```tsx
{forward !== null ? (
  <div className="-mt-3 flex flex-col gap-4">
    <SafeToSpendCard
      safePerDay={forward.safePerDay}
      avgPerDay={forward.avgPerDay}
      daysLeft={forward.daysLeft}
      upcoming={forward.upcoming}
    />
    <ProjectedCard projected={forward.projected} totalBudget={totalStatus?.limit ?? null} />
  </div>
) : null}
```

> `totalStatus?.limit ?? null` supplies the total budget the ProjectedCard needs — `totalStatus` is the already-destructured `BudgetTotal | null`, whose `limit` is the total-budget figure.

- [ ] **Step 4: Delete the dead dashboard files**

```bash
git rm src/app/dashboard/page.tsx \
       src/features/entries/use-dashboard.ts \
       src/features/entries/use-dashboard.test.ts \
       src/features/entries/ui/DashboardCards.tsx \
       src/features/entries/ui/DashboardSkeleton.tsx
```

- [ ] **Step 5: Verify no stragglers reference the deleted modules**

Run: `git grep -nE "use-dashboard|useDashboard|DashboardCards|DashboardSkeleton" -- 'src/*' || echo "clean"`
Expected: `clean` (the only remaining `dashboard` hits are `dashboard.ts` / `dashboard.test.ts`, which we keep — confirm with `git grep -n "from './dashboard'"` showing `use-home.ts` and, after Task 3, `use-analytics.ts`).

- [ ] **Step 6: Gate and commit**

```bash
npm run format:files src/app/page.tsx src/features/entries/ui/ForwardCards.tsx src/features/entries/ui/CycleDeltaCard.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add -A
git commit -m "feat(app): merge the dashboard into Home and delete the /dashboard route" -m "Home now renders the safe-to-spend and projection cards (moved to ForwardCards) below its headline for the current cycle. The vs-last card moves to a standalone CycleDeltaCard for Trends (wired next). Recent activity is dropped — the Records tab already lists it. use-dashboard, DashboardCards and DashboardSkeleton are removed; the pure dashboard math stays."
```

---

### Task 3: Move the this-vs-last card onto Trends

Give `useAnalytics` a `delta` derived from its trend bars and render `CycleDeltaCard` on the analytics page.

**Files:**
- Modify: `src/features/entries/use-analytics.ts`
- Modify: `src/app/analytics/page.tsx`
- Test: `src/features/entries/use-analytics.test.ts`

**Interfaces:**
- Consumes: `cycleDelta(total, prevTotal) → CycleDelta`, `type CycleDelta` from `./dashboard`; `bars: TrendBar[]` already on `AnalyticsData` (each `{ key, label, value, partial }`); `CycleDeltaCard` from Task 2.
- Produces: `delta: CycleDelta | null` on `AnalyticsData`.

> Derivation rationale: the trend window's last two bars ARE the anchor cycle and the one before it, so the delta needs no extra query. In this spending-only ledger a cycle with entries always has `value > 0`, so `prevBar.value === 0` marks "no comparable earlier cycle" (null) — the same treatment `completeBars` gives a zero cycle. Shown only in the unfiltered view (`category === null`), matching the total-spend semantics the old dashboard card had.

- [ ] **Step 1: Write the failing test**

Add to `src/features/entries/use-analytics.test.ts` (follow the file's existing seeding/mocking harness — `makeNodeProxyDb`, ensure-table calls, `addEntries`, `vi.mock('@shared/date')` pinning `todayIso`, `useAnalytics(cycleParam, category)`):

```ts
describe('delta (this cycle vs last, moved from the dashboard)', () => {
  it('reports the unfiltered anchor cycle against the previous one', async () => {
    // Seed two adjacent cycles with default cutoff 18: '2026-06' (Jun18–Jul17) = 170, prior
    // '2026-05' (May18–Jun17) = 200. Pin today into '2026-06' so it is the anchor/current cycle.
    vi.mocked(todayIso).mockReturnValue('2026-07-01');
    const db = await getBrowserDb();
    await addEntries(db, [{ date: '2026-05-20', account: 'Cash', category: 'Food', amount: -200 }]);

    const { result } = renderHook(() => useAnalytics(null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.data?.delta).toEqual({ delta: -30, direction: 'down', prevTotal: 200 });
  });

  it('is null when filtered to a category', async () => {
    vi.mocked(todayIso).mockReturnValue('2026-07-01');
    const { result } = renderHook(() => useAnalytics(null, 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.delta).toBeNull();
  });
});
```

> Adjust the seeded figures/keys if the file's existing `beforeEach` already seeds a different current cycle — the assertion pattern (anchor − prev, null when filtered) is what matters. Keep amounts negative (outflows).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- use-analytics`
Expected: FAIL — `delta` does not exist on `AnalyticsData`.

- [ ] **Step 3: Implement `delta`**

In `src/features/entries/use-analytics.ts`:

Add to the `./dashboard` import (add a new import line — the file does not currently import from it):

```ts
import { cycleDelta, type CycleDelta } from './dashboard';
```

Add `delta: CycleDelta | null;` to the `AnalyticsData` type (place it after `budgetLine: number | null;`).

Where `bars` is available in the effect (after `toTrendBars(...)` produces them and before `setData`), compute:

```ts
// The anchor cycle vs the one before it — the trend window's last two bars, so no extra query. A
// zero prev bar means no comparable earlier cycle (null). Unfiltered only: filtered, `bars` is one
// category's trend and a "vs last" there would answer a different question.
const lastBar = bars[bars.length - 1];
const prevBar = bars[bars.length - 2];
const prevTotal = prevBar !== undefined && prevBar.value > 0 ? prevBar.value : null;
const delta =
  category === null && lastBar !== undefined ? cycleDelta(lastBar.value, prevTotal) : null;
```

Add `delta,` to the `setData({ ... })` object.

- [ ] **Step 4: Render it on the Trends page**

In `src/app/analytics/page.tsx`:

Add the import:

```tsx
import { CycleDeltaCard } from '@features/entries/ui/CycleDeltaCard';
```

Add `delta,` to the destructure of `data`.

Render it between the main panel `</section>` (line ~197) and the `<div className="flex flex-col gap-3">` heatmap/notes block:

```tsx
{delta !== null ? <CycleDeltaCard delta={delta} /> : null}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- use-analytics`
Expected: PASS (existing analytics tests stay green — `delta` is additive).

- [ ] **Step 6: Gate and commit**

```bash
npm run format:files src/features/entries/use-analytics.ts src/app/analytics/page.tsx src/features/entries/use-analytics.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/use-analytics.ts src/app/analytics/page.tsx src/features/entries/use-analytics.test.ts
git commit -m "feat(features): move the this-vs-last card onto Trends" -m "useAnalytics derives the anchor-vs-previous delta from its own trend bars (no extra query), shown unfiltered only. The analytics page renders CycleDeltaCard between the trend and the heatmap/notes block."
```

---

### Task 4: Nav — promote Trends, drop the Dashboard tab and Analytics tile

Swap the bottom-bar Dashboard tab for a Trends tab pointing at `/analytics`, and remove Analytics from the More sheet.

**Files:**
- Modify: `src/shared/ui/BottomBar.tsx`
- Modify: `src/shared/ui/MoreSheet.tsx`

**Interfaces:**
- Consumes: `cycleHref(path, cycle)`, `isActivePath(pathname, path)` (both already used in `BottomBar`).
- Produces: no new exports.

- [ ] **Step 1: Replace the Dashboard tab with a Trends tab**

In `src/shared/ui/BottomBar.tsx`, replace the Dashboard `BarTab` (the block with `href="/dashboard"`, `label="Dashboard"`, `icon={<DashboardIcon />}`) with:

```tsx
<BarTab
  href={cycleHref('/analytics', cycle)}
  label="Trends"
  active={isActivePath(pathname, '/analytics')}
  icon={<TrendsIcon />}
/>
```

Update the slot comment near the top of the component (currently `// Home · Records · [＋ expense FAB → /entries/new] · Analytics · More.` — it is already stale) to:

```tsx
// Home · Records · [＋ expense FAB → /entries/new] · Trends · More.
```

- [ ] **Step 2: Swap the icon**

Replace the `DashboardIcon` function with a `TrendsIcon` (a bar-chart glyph, distinct from Home's rising line and matching the More sheet's old `LineChart` semantics), keeping the same 24px outline style:

```tsx
// Trends = the six-cycle history / "is this normal" surface (was Analytics, in the More sheet).
// Ascending bars read as "spending over time", distinct from Home's rising-line overview glyph.
function TrendsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 13V9 M6.5 13V6 M10 13V8 M13.5 13V4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

- [ ] **Step 3: Remove Analytics from the More sheet**

In `src/shared/ui/MoreSheet.tsx`, delete the Analytics entry from `LINKS`:

```ts
  { href: '/analytics', label: 'Analytics', Icon: LineChart, cycle: true },
```

and remove `LineChart` from the `lucide-react` import (it is now unused — leaving it is an ESLint error):

```ts
import { Tags, Wallet, Plane, Repeat, Settings, Target } from 'lucide-react';
```

- [ ] **Step 4: Gate**

```bash
npm run format:files src/shared/ui/BottomBar.tsx src/shared/ui/MoreSheet.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
```
Expected: all green. `git grep -nE "/dashboard|DashboardIcon" -- 'src/*'` → no matches.

- [ ] **Step 5: Verify at 412px in a browser**

Run `npm run dev:web`, open `http://127.0.0.1:4010` at a 412px width, and confirm:
- Bottom bar reads **Home · Records · [＋] · Trends · More**; the Trends tab opens `/analytics` and shows the active pill there.
- **Home** (current cycle): headline → Safe-to-spend card → Projected card → Chart/List toggle → donut. Page back one cycle with the selector: the two forward cards disappear, the donut stays.
- **Trends**: anomaly (if any) → trend chart → **This cycle vs last** card → category list → heatmap → top notes.
- **More** sheet no longer lists Analytics; Budgets/Categories/Accounts/Trips/Recurring/Settings remain.

- [ ] **Step 6: Commit**

```bash
git add src/shared/ui/BottomBar.tsx src/shared/ui/MoreSheet.tsx
git commit -m "feat(app): promote Analytics to the Trends bottom tab, retire Dashboard" -m "The freed bottom-bar slot (Home+Dashboard merged) now holds Trends → /analytics, carrying the selected cycle; the More sheet drops its Analytics tile. Bottom bar is Home · Records · [＋] · Trends · More."
```

---

## Self-Review

**Spec coverage:**
- Nav change (Dashboard→Trends tab, `/dashboard` deleted, Analytics out of More, relabel) → Tasks 2 + 4. ✅
- Screen 1 merge (forward figures folded into Home, forward-only-for-current-cycle, drop Recent) → Tasks 1 + 2. ✅
- Screen 2 (this-vs-last moved to Trends; heatmap/notes/anomaly untouched — already there) → Task 3. ✅
- Phase 1 only; top-transactions (Phase 2) and spending-by-account (Phase 3) are explicitly out of this plan and get their own plans. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; the one "adjust seeded figures" note in Task 3 Step 1 gives the exact assertion pattern and constraints, not a hand-wave. ✅

**Type consistency:** `HomeForward` (Task 1) is consumed by `ForwardCards` (Task 2) and Home (Task 2 Step 3); `CycleDelta` from `dashboard.ts` flows into `CycleDeltaCard` (Task 2) and `useAnalytics.delta` (Task 3); `TrendBar` fields (`value`) match the derivation. `totalStatus?.limit` matches `BudgetTotal`. ✅

## Notes / deliberate simplifications

- **Reused the big forward cards rather than re-folding them into the headline as a compact line.** Preserves the tested null/0/no-budget nuance without rewriting; the visual can be tightened later if the stacked headline + card reads too heavy. (`ponytail:` reuse over rewrite — revisit only if the merged headline feels top-heavy in the browser.)
- **`HomeSkeleton` is left as-is** — it already covers the headline+donut; the two extra forward cards pop in a frame later without a jarring layout shift. Add forward-card placeholders only if that pop is visible at 412px.
- **Phases 2–3 (top transactions, spending-by-account) are separate plans** — each is independent and additive, and Phase 1 is complete and shippable on its own.
