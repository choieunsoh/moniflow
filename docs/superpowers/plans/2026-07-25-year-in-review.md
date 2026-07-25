# Year-in-Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/year` route — a trailing-12-cycle spending recap reached from the More sheet — reusing existing query and chart primitives, with no new DB column or query.

**Architecture:** One pure fn (`yearSummary`) folds a single `getEntriesInRange` over the 12-cycle span into a headline total, a 12-bar trend, ranked categories, biggest month, biggest transaction, top merchants, day-of-week rhythm, and an average. A read hook (`useYear`) fetches; a thin `/year` page renders, reusing `TrendChart`, `TopNotesList`, `WeekdayCard`, and `CategoryIcon`. One `MoreSheet` grid entry links to it.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless relative imports), React 19, Next 16 App Router (`'use client'`, static export), Vitest + `@testing-library/react`, ECharts (via the existing `TrendChart`), Tailwind v4 tokens, lucide-react icons.

## Global Constraints

- **No new DB column/table/query.** Uses the existing `getEntriesInRange(db, start, end)` (returns expenses only) and existing settings/category meta queries. Do NOT touch `schema.ts` / `worker.ts` / `column-migrations.ts`.
- **TS bans (lint errors):** no `any`, no `as`, no `!`, no `// @ts-*`; `type` over `interface`; `for..of` over `.forEach`; `as const`/`satisfies` where a literal/contract applies.
- **Window = trailing 12 cycles**, `lastCycles(activeKey, 12, cutoff)`, oldest→newest, anchor = last. Cycle keys are `YYYY-MM` anchored to the START month.
- **Magnitudes:** ledger stores outflows negative; all sums use `Math.abs`, ranked biggest-first.
- **`biggestMonth` and `avgPerCycle` use `completeBars(bars)`** (from `trend.ts`) — excludes the live partial cycle and zero cycles, matching the trend average's honesty.
- **Money:** `formatBahtWhole` for glance/aggregate figures, `formatBaht` for a single stored transaction amount; `tnum` class on figures.
- **Reads async, post-mount, `{ ready, data }`;** `?cycle=` anchors the window; refetch via `useDataVersion`. Route renders a `…` placeholder until `ready`, `EmptyLedger` when there is no spend.
- **Cycle type (verbatim):** `type Cycle = { key: string; start: string; end: string; label: string }` (from `./cycle`).
- **Commit** `type(scope): subject` (scope: `entries` for the feature modules, `shared` for the MoreSheet edit), repeated `-m`; NO `Claude-Session:` trailer.
- **Verify at 412px in a real browser** — the Node shim proves queries only, never the worker/OPFS/layout.
- **Branch:** implement on a feature branch, not `main` (spec + plan are committed to `main`).

---

## Task 1: `yearSummary` pure fn

**Files:**
- Create: `src/features/entries/year.ts`
- Test: `src/features/entries/year.test.ts`

**Interfaces:**
- Consumes: `EntryRow` (`./schema`), `Cycle` (`./cycle`), `toTrendBars`/`completeBars`/`TrendBar` (`./trend`), `topTransactions` (`./top-transactions`), `topNotes`/`NoteRow` (`./by-note`), `byWeekday`/`WeekdayStats` (`./by-weekday`).
- Produces: `type YearCategory`, `type YearSummary`, `function yearSummary(entries: EntryRow[], cycles: Cycle[], currentKey: string): YearSummary`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { yearSummary } from './year';
import { lastCycles } from './cycle';
import type { EntryRow } from './schema';

const CUTOFF = 18;

// Minimal EntryRow factory — only the fields yearSummary reads matter.
function e(date: string, amount: number, category = 'Food', note: string | null = null): EntryRow {
  return {
    id: Math.abs(hash(date + amount + category)), date, time: null, accountId: 1, categoryId: 1,
    amount, currency: null, originalAmount: null, note, source: 'manual', offBudget: null,
    category, account: 'Cash',
  };
}
function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

describe('yearSummary', () => {
  // 12 real cycles ending at 2026-07 (cutoff 18). Each cycle N runs its 18th → next 17th.
  const cycles = lastCycles('2026-07', 12, CUTOFF);

  it('totals, buckets into 12 bars, and ranks categories window-wide', () => {
    const entries = [
      e('2026-06-20', -1000, 'Food'), // June cycle (2026-06)
      e('2026-06-25', -500, 'Fun'), // June cycle
      e('2026-05-19', -300, 'Food'), // May cycle (2026-05)
    ];
    const s = yearSummary(entries, cycles, '2026-07');
    expect(s.bars).toHaveLength(12);
    expect(s.total).toBe(1800);
    expect(s.bars.find((b) => b.key === '2026-06')?.value).toBe(1500);
    expect(s.bars.find((b) => b.key === '2026-05')?.value).toBe(300);
    expect(s.categories).toEqual([
      { name: 'Food', value: 1300, count: 2 },
      { name: 'Fun', value: 500, count: 1 },
    ]);
  });

  it('picks the biggest COMPLETE month and averages over complete cycles with spend', () => {
    const entries = [
      e('2026-05-19', -2000, 'Food'), // May: 2000
      e('2026-06-20', -1000, 'Food'), // June: 1000
      e('2026-07-20', -9999, 'Food'), // July = current/partial — must NOT be "biggest month"
    ];
    const s = yearSummary(entries, cycles, '2026-07');
    expect(s.biggestMonth).toEqual({ key: '2026-05', label: 'May', value: 2000 });
    // average over complete-with-spend (May 2000, June 1000) — July excluded as partial
    expect(s.avgPerCycle).toBe(1500);
    expect(s.activeCycleCount).toBe(2);
  });

  it('delegates biggest transaction, top notes, and weekday to the shared helpers', () => {
    const entries = [
      e('2026-06-20', -800, 'Food', 'Sushi'),
      e('2026-06-21', -1200, 'Fun', 'Concert'),
    ];
    const s = yearSummary(entries, cycles, '2026-07');
    expect(s.biggestTransaction?.note).toBe('Concert');
    expect(s.topNotes[0]).toEqual({ note: 'Concert', total: 1200, count: 1 });
    expect(s.weekday.totalCount).toBe(2);
  });

  it('is empty and null-safe on no entries', () => {
    const s = yearSummary([], cycles, '2026-07');
    expect(s.total).toBe(0);
    expect(s.categories).toEqual([]);
    expect(s.biggestMonth).toBeNull();
    expect(s.biggestTransaction).toBeNull();
    expect(s.avgPerCycle).toBeNull();
    expect(s.bars).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- year`
Expected: FAIL — `yearSummary` not found. (Filter matches `year.test.ts`; ignore `by-weekday`.)

- [ ] **Step 3: Write the implementation**

```ts
// src/features/entries/year.ts
import type { EntryRow } from './schema';
import type { Cycle } from './cycle';
import { toTrendBars, completeBars, type TrendBar } from './trend';
import { topTransactions } from './top-transactions';
import { topNotes, type NoteRow } from './by-note';
import { byWeekday, type WeekdayStats } from './by-weekday';

export type YearCategory = { name: string; value: number; count: number };

// A trailing-12-cycle recap, folded from ONE getEntriesInRange over the window (the hook bounds the
// query to cycles[0].start..cycles[11].end, so every entry falls in some cycle). Pure — buckets each
// entry into its cycle by date range and reuses the shared trend/tx/note/weekday helpers, so the
// recap and the rest of the app agree by construction.
export type YearSummary = {
  total: number;
  bars: TrendBar[];
  categories: YearCategory[];
  // Over COMPLETE cycles only (not the live partial) — a mid-cycle month must not be crowned biggest.
  biggestMonth: { key: string; label: string; value: number } | null;
  biggestTransaction: EntryRow | null;
  topNotes: NoteRow[];
  weekday: WeekdayStats;
  // Mean over complete cycles that have spend; null when there are none (see completeBars).
  avgPerCycle: number | null;
  activeCycleCount: number;
};

export function yearSummary(
  entries: EntryRow[],
  cycles: Cycle[],
  currentKey: string,
): YearSummary {
  const perCycle = new Map<string, number>();
  for (const c of cycles) perCycle.set(c.key, 0);
  const perCategory = new Map<string, { value: number; count: number }>();

  for (const entry of entries) {
    const mag = Math.abs(entry.amount);
    const cycle = cycles.find((c) => entry.date >= c.start && entry.date <= c.end);
    if (cycle !== undefined) perCycle.set(cycle.key, (perCycle.get(cycle.key) ?? 0) + mag);
    const cat = perCategory.get(entry.category) ?? { value: 0, count: 0 };
    perCategory.set(entry.category, { value: cat.value + mag, count: cat.count + 1 });
  }

  const bars = toTrendBars(cycles, perCycle, currentKey);
  const total = [...perCycle.values()].reduce((sum, v) => sum + v, 0);

  const categories: YearCategory[] = [...perCategory.entries()]
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  const complete = completeBars(bars);
  const ranked = [...complete].sort((a, b) => b.value - a.value);
  const biggestMonth =
    ranked.length > 0
      ? { key: ranked[0].key, label: ranked[0].label, value: ranked[0].value }
      : null;
  const avgPerCycle =
    complete.length > 0 ? complete.reduce((sum, b) => sum + b.value, 0) / complete.length : null;

  return {
    total,
    bars,
    categories,
    biggestMonth,
    biggestTransaction: topTransactions(entries, 1)[0] ?? null,
    topNotes: topNotes(entries),
    weekday: byWeekday(entries),
    avgPerCycle,
    activeCycleCount: complete.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- year`
Expected: PASS (4 tests).

- [ ] **Step 5: Format, typecheck, lint, commit**

```bash
npm run format:files src/features/entries/year.ts src/features/entries/year.test.ts
npm run typecheck && npm run lint
git add src/features/entries/year.ts src/features/entries/year.test.ts
git commit -m "feat(entries): yearSummary — trailing-12-cycle recap fold" -m "Pure fn: buckets one windowed entry set into 12 cycle bars, ranks categories, picks the biggest COMPLETE month, averages over complete-with-spend cycles, and delegates biggest-tx/top-notes/weekday to the shared helpers."
```

---

## Task 2: `useYear` read hook

**Files:**
- Create: `src/features/entries/use-year.ts`
- Test: `src/features/entries/use-year.test.ts`

**Interfaces:**
- Consumes: `yearSummary`/`YearSummary` (Task 1), `withDb` (`@shared/db-effect`), `getEntriesInRange` (`./queries`), `lastCycles`/`currentCycleKey` (`./cycle`), `getCutoff`/`getIconSet`/`IconSet` (`@features/settings/queries`), `getEmojiMap`/`getHueMap` (`@features/categories/queries`), `todayIso` (`@shared/date`), `useDataVersion` (`@shared/data-version`).
- Produces: `const YEAR_CYCLES = 12`, `type YearData = YearSummary & { emojiMap; hueMap; iconSet }`, `function useYear(cycleKey: string | null): { ready: boolean; data: YearData | null }`.

**Note:** open `src/features/entries/use-analytics.ts` and `use-analytics.test.ts` first — this hook mirrors that structure and the test reuses the same Node-shim seeding harness. Do not invent a new harness.

- [ ] **Step 1: Write the failing test**

Model it on `use-analytics.test.ts`'s `renderHook` + db-seeding pattern (mock `todayIso` to a fixed date so the window is deterministic). Seed a category across two cycles and assert the hook's derived data.

```ts
// Mirror use-analytics.test.ts's harness (renderHook, seeded getBrowserDb node shim, todayIso mock).
// Seed e.g. Food 1000 in the May cycle and 1400 in the June cycle, todayIso in the July cycle.
it('folds the window into a year summary with category meta', async () => {
  // ...seed via the existing harness...
  const { result } = renderHook(() => useYear(null));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.data?.bars).toHaveLength(12);
  expect(result.current.data?.total).toBe(2400);
  expect(result.current.data?.categories[0]).toEqual({ name: 'Food', value: 2400, count: 2 });
  expect(typeof result.current.data?.iconSet).toBe('string');
});

it('reports an empty ledger as no categories', async () => {
  const { result } = renderHook(() => useYear(null));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.data?.categories).toEqual([]);
});
```

> Copy the exact seeding/import lines from `use-analytics.test.ts`. If it mocks `todayIso` via `vi.mock('@shared/date', …)`, reuse that mock verbatim so the window anchors deterministically.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- use-year`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/entries/use-year.ts
'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntriesInRange } from './queries';
import { lastCycles, currentCycleKey } from './cycle';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import { yearSummary, type YearSummary } from './year';

// Twelve cycles = "the last year". Tunable in one place. Deliberately not shared with TREND_CYCLES
// (6): the trend answers "is this normal", the recap answers "where did the year go".
export const YEAR_CYCLES = 12;

export type YearData = YearSummary & {
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// The /year recap's data, read after mount from the browser OPFS db. Re-runs on ?cycle= change or
// after any write (useDataVersion). One getEntriesInRange over the whole window — the cycles are
// contiguous, so [cycles[0].start, last.end] covers every entry the fold needs.
export function useYear(cycleKey: string | null): { ready: boolean; data: YearData | null } {
  const [data, setData] = useState<YearData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
      ]);

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeKey = cycleKey ?? currentKey;
      const cycles = lastCycles(activeKey, YEAR_CYCLES, cutoff);
      const entries = await getEntriesInRange(db, cycles[0].start, cycles[cycles.length - 1].end);

      setData({ ...yearSummary(entries, cycles, currentKey), emojiMap, hueMap, iconSet });
      setReady(true);
    });
  }, [cycleKey, version]);

  return { ready, data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- use-year`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

```bash
npm run format:files src/features/entries/use-year.ts src/features/entries/use-year.test.ts
npm run typecheck && npm run lint && npm test
git add src/features/entries/use-year.ts src/features/entries/use-year.test.ts
git commit -m "feat(entries): useYear — read hook for the year recap" -m "Mirrors use-analytics: cutoff + lastCycles(12) + one getEntriesInRange over the window + category/icon meta, folded via yearSummary. Refetches on ?cycle= or useDataVersion."
```

---

## Task 3: `/year` page + More sheet entry

**Files:**
- Create: `src/app/year/page.tsx`
- Modify: `src/shared/ui/MoreSheet.tsx`
- (If it exists) update any `MoreSheet` test that asserts the link count/labels.

**Interfaces:**
- Consumes: `useYear`/`YearData` (Task 2), `PageContainer` (`@shared/ui/PageContainer`), `TrendChart`, `TopNotesList`, `WeekdayCard`, `EmptyLedger` (all under `@features/entries/ui`), `CategoryIcon` (`@features/categories/ui/CategoryIcon`), `emojiFor`/`hueFor` (`@features/categories/queries`), `formatBaht`/`formatBahtWhole` (`@shared/money`), `formatDayHeading` (`@shared/date`), `CalendarRange` (`lucide-react`).

- [ ] **Step 1: Create the page**

```tsx
// src/app/year/page.tsx
'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { useYear } from '@features/entries/use-year';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { TopNotesList } from '@features/entries/ui/TopNotesList';
import { WeekdayCard } from '@features/entries/ui/WeekdayCard';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBaht, formatBahtWhole } from '@shared/money';
import { formatDayHeading } from '@shared/date';

// The /year recap — a trailing-12-cycle "where did it go" summary reached from the More sheet. All
// figures come from useYear (one windowed query, folded by yearSummary). Reuses TrendChart /
// TopNotesList / WeekdayCard / CategoryIcon so it reads as the same app, not a second dialect.
const TOP_CATEGORY_ROWS = 8;

export default function YearPage() {
  const { ready, data } = useYear(useSearchParams().get('cycle'));

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Year in review</h1>
        <p className="p-8 text-center" style={{ color: 'var(--color-muted)' }}>
          …
        </p>
      </PageContainer>
    );
  }

  const {
    total,
    bars,
    categories,
    biggestMonth,
    biggestTransaction,
    topNotes,
    weekday,
    avgPerCycle,
    emojiMap,
    hueMap,
    iconSet,
  } = data;

  if (categories.length === 0) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Year in review</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  const last = bars[bars.length - 1];
  const windowLabel = `${bars[0].label} – ${last.label} ${last.key.split('-')[0]}`;

  return (
    <PageContainer size="full">
      <h1 className="sr-only">Year in review</h1>

      <section className="panel flex flex-col gap-5 p-5">
        <header className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-base font-semibold">Year in review</h2>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {windowLabel}
            </span>
          </div>
          <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
        </header>
        <TrendChart bars={bars} budget={null} label="Spending over the last 12 cycles" />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel flex flex-col gap-1 p-4">
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Biggest month
          </span>
          {biggestMonth === null ? (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              —
            </span>
          ) : (
            <>
              <span className="tnum text-lg font-semibold">
                {formatBahtWhole(biggestMonth.value)}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {biggestMonth.label}
              </span>
            </>
          )}
        </div>
        <div className="panel flex flex-col gap-1 p-4">
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Average / cycle
          </span>
          <span className="tnum text-lg font-semibold">
            {avgPerCycle === null ? '—' : formatBahtWhole(avgPerCycle)}
          </span>
        </div>
      </div>

      {biggestTransaction !== null ? (
        <section className="panel flex flex-col gap-3 p-5" aria-label="Biggest single purchase">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
            Biggest purchase
          </h2>
          <Link
            prefetch={false}
            href={`/entries/edit?id=${biggestTransaction.id}`}
            aria-label={`${biggestTransaction.note ? `${biggestTransaction.note} (${biggestTransaction.category})` : biggestTransaction.category} ${formatBaht(Math.abs(biggestTransaction.amount))} on ${formatDayHeading(biggestTransaction.date)}`}
            className="flex min-h-11 items-center gap-3 text-sm"
          >
            <CategoryIcon
              emoji={emojiFor(emojiMap, biggestTransaction.category)}
              name={biggestTransaction.category}
              hue={hueFor(hueMap, biggestTransaction.category)}
              iconSet={iconSet}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">
                {biggestTransaction.note ? biggestTransaction.note : biggestTransaction.category}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {formatDayHeading(biggestTransaction.date)}
              </span>
            </span>
            <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
              {formatBaht(Math.abs(biggestTransaction.amount))}
            </span>
          </Link>
        </section>
      ) : null}

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          Top categories
        </h2>
        <ul className="flex flex-col gap-2.5">
          {categories.slice(0, TOP_CATEGORY_ROWS).map((c) => (
            <li key={c.name} className="flex items-center gap-3 text-sm">
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
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-3">
        <WeekdayCard stats={weekday} />
        <TopNotesList notes={topNotes} />
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 2: Add the More sheet entry**

In `src/shared/ui/MoreSheet.tsx`, add `CalendarRange` to the lucide import and one `LINKS` entry. Place it before `Settings` (Settings stays last):

```tsx
import { Tags, Wallet, Plane, Repeat, Settings, Target, CalendarRange } from 'lucide-react';
```
```tsx
  { href: '/trips', label: 'Trips', Icon: Plane, cycle: false },
  { href: '/year', label: 'Year', Icon: CalendarRange, cycle: false },
  { href: '/settings', label: 'Settings', Icon: Settings, cycle: false },
```

(Tile label is the short "Year"; the page's own heading is "Year in review".)

- [ ] **Step 3: Update any MoreSheet test**

Run: `npm test -- MoreSheet`
If a test asserts the number of tiles or the exact label set, add `/year` / "Year" to its expectations. If there is no MoreSheet test, note that and move on. (Do NOT weaken an assertion — extend it.)

- [ ] **Step 4: Gates**

Run each separately:
```bash
npm run format:files src/app/year/page.tsx src/shared/ui/MoreSheet.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build:web
```
`build:web` must emit a `/year` route (static export). Expected: all pass; `out/year.html` (or `out/year/index.html`) exists.

- [ ] **Step 5: Browser verification at 412px**

`npm run dev:web` (port 4010; if occupied it's already running — reuse it, do NOT CSV-restore anyone's data). With a data-bearing ledger:
- Open the More sheet → confirm the **Year** tile (calendar icon) sits between Trips and Settings; tap it → `/year`.
- On `/year`: headline total + a **12-bar** trend (check x-axis labels aren't unreadable at 412px — if crowded, rotate/thin via `TrendChart`'s ECharts `axisLabel`, a follow-up note if so); Biggest month + Average tiles; Biggest purchase (taps to `/entries/edit?id=`); Top categories (≤8); WeekdayCard + Top notes.
- Empty-ledger origin (or `?cycle=` far in the past with no data) → `EmptyLedger`, no crash.
- 0 console errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/year/page.tsx src/shared/ui/MoreSheet.tsx
# plus any updated MoreSheet test
git commit -m "feat(app): year-in-review page + More sheet entry" -m "New /year route renders the useYear recap (headline + 12-cycle trend, biggest month/average tiles, biggest purchase, top categories, weekday + top merchants), reusing TrendChart/TopNotesList/WeekdayCard/CategoryIcon. Adds a 'Year' tile to the More grid."
```

---

## Task 4: Final verification

- [ ] **Step 1: Full gate run**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
```
Expected: all green; `/year` in the static export.

- [ ] **Step 2: Confirm the browser walkthrough from Task 3 Step 5 passed** (More tile → /year → all sections → empty state → no console errors).

- [ ] **Step 3: Merge** per `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage:**
- Trailing-12-cycle window → `lastCycles(activeKey, 12)` in `useYear`. ✓
- `/year` route in the More sheet → Task 3 (page + MoreSheet entry). ✓
- Headline total + 12-cycle bar trend → Task 3 header + `TrendChart`. ✓
- Top categories + biggest month → `yearSummary.categories` / `.biggestMonth` (Task 1), rendered Task 3. ✓
- Biggest transaction + top merchants → `.biggestTransaction` / `.topNotes` (Task 1), rendered Task 3. ✓
- Average + day-of-week → `.avgPerCycle` / `.weekday` (Task 1), rendered Task 3. ✓
- No new query/column → uses existing `getEntriesInRange`; Global Constraints. ✓
- Honesty ceilings (complete-cycle basis, leading zeros) → `completeBars` in Task 1, documented. ✓

**Type consistency:** `YearSummary`/`YearCategory` (Task 1) consumed verbatim by `YearData`/`useYear` (Task 2) and destructured on the page (Task 3). `Cycle` shape matches `./cycle`. `TrendChart` receives `bars: TrendBar[]`, `budget: null`. `WeekdayCard` receives `stats: WeekdayStats`; `TopNotesList` receives `notes: NoteRow[]` — both match their component props.

**Open confirmations for the implementer (not blockers):** the `use-analytics.test.ts` seeding harness + `todayIso` mock (reuse verbatim); whether a `MoreSheet` test asserts link count (extend it if so); 12-label x-axis density at 412px (rotate/thin only if it reads badly).
