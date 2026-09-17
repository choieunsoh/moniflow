# Records Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tap-a-day calendar as a 4th Records view (`?view=calendar`), with glyph marks for posted
bills, upcoming bills and off-budget spend, sharing one grid with the Trends heatmap, which switches
to discretionary darkness and loses its invisible-day-number bug.

**Architecture:** Pure modules (`heatmap.ts`, new `calendar-marks.ts`) compute cells and marks from
data the app already has (`discretionaryByDate`, `isFixed`, `isOffBudget`, `postsBetween`). A new
shared `CalendarGrid` renders them; `SpendHeatmap` becomes its thin Trends wrapper. `useRecords`
builds a `calendar` payload only when the view is active; `RecordsCalendar` renders grid + the
selected day's rows. No schema, migration, or backup change.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript strict, Tailwind v4, Vitest +
Testing Library, drizzle sqlite-proxy (Node shim in tests).

**Spec:** `docs/superpowers/specs/2026-09-17-records-calendar-design.md`

## Global Constraints

- Branch `feat/records-calendar` (already created, spec committed). Never commit to `main`.
- Shell: **Git Bash / POSIX syntax** for every command. Never PowerShell.
- TS bans (lint errors): no `any`, no `as` casts (`as const` is allowed), no `!`, no ts-comments; `type` over `interface`; `for..of` over `forEach`.
- Money: `formatLedgerSpend` for a row or a plain sum of stored amounts; `formatBahtWhole` for glance figures; foreign amounts via `formatForeign(amount, currency)` (`src/features/entries/trips.ts`). Never `formatSignedBaht(-x)`.
- User-facing dates via `formatDayHeading` (`@shared/date`); never string-slice a date for display (the existing `dayOfMonth` helper in the grid is the one sanctioned exception, it reads a number).
- Numbers render with the `tnum` class (system sans + tabular-nums). No monospace fonts.
- Colours only through existing tokens (`--color-text`, `--color-muted`, `--color-surface`, `--color-surface-2`). No new colour, no hue for mark kinds.
- Every read hook effect goes through `withDb` (already true in the hooks touched).
- Before each commit: `npm run format:files <changed files>`, then `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. All must pass.
- Commit format: `type(scope): subject` + a body `-m` explaining why. Scope is ONE word: `features`, `app`, `shared`, or `product` (docs). Use repeated `-m` flags, never `-F` or a heredoc. No `Co-Authored-By` / `Claude-Session` trailers.
- The dev ledger at `127.0.0.1:4010` holds REAL data. Browser checks only read and tap days; any delete test uses a ฿1 row you created yourself.

## File Map

| File | Change | Responsibility |
| --- | --- | --- |
| `src/features/entries/heatmap.ts` | Modify | `toHeatmapCells` takes a per-date spend `Map` |
| `src/features/entries/heatmap.test.ts` | Modify | Tests for the map input |
| `src/features/entries/use-analytics.ts` | Modify | Feed discretionary spend to the heatmap |
| `src/features/entries/use-analytics.test.ts` | Modify | Currencies table + discretionary test |
| `src/features/entries/calendar-marks.ts` | Create | `dayMarks`, `resolveSelectedDay`, `DayMarks` |
| `src/features/entries/calendar-marks.test.ts` | Create | Pure tests |
| `src/features/entries/ui/CalendarGrid.tsx` | Create | Shared grid, `RAMP`, `DayMark` glyphs, legend |
| `src/features/entries/ui/CalendarGrid.test.tsx` | Create | Render tests |
| `src/features/entries/ui/SpendHeatmap.tsx` | Modify | Trends card wrapper around `CalendarGrid` |
| `src/app/globals.test.ts` | Modify | Ramp contrast assertion |
| `src/features/entries/use-records.ts` | Modify | `'calendar'` group-by + `calendar` payload |
| `src/features/entries/use-records-calendar.test.ts` | Create | Hook tests (own file: pins `todayIso`) |
| `src/features/entries/ui/RecordsCalendar.tsx` | Create | Grid panel + selected-day list |
| `src/features/entries/ui/RecordsCalendar.test.tsx` | Create | Render tests |
| `src/app/records/page.tsx` | Modify | `?day=`, Calendar tab, calendar branch |
| `src/app/records/page.test.tsx` | Modify | `calendar: null` fixture + calendar tests |
| `PRODUCT.md` | Modify | Describe the Records calendar |

---

### Task 1: Heatmap darkness from discretionary spend

**Files:**
- Modify: `src/features/entries/heatmap.ts:1-33`
- Modify: `src/features/entries/heatmap.test.ts:1-64`
- Modify: `src/features/entries/use-analytics.ts:15-24,117-124,155`
- Modify: `src/features/entries/use-analytics.test.ts` (imports; lines 31, 92, 232; new test)

**Interfaces:**
- Consumes: `discretionaryByDate(entries, offBudgetCategories, travelCurrencies): Map<string, number>` from `src/features/entries/off-budget.ts` (positive = spend).
- Produces: `toHeatmapCells(totals: ReadonlyMap<string, number>, cycle: Cycle): HeatmapCell[]`. `HeatmapCell = { date: string; total: number; intensity: number }` is unchanged.

- [ ] **Step 1: Rewrite the `toHeatmapCells` tests for the map input**

Replace lines 1–64 of `src/features/entries/heatmap.test.ts` (imports through the end of the
`toHeatmapCells` describe) with:

```ts
import { describe, it, expect } from 'vitest';
import { toHeatmapCells, toCalendarLayout, type HeatmapCell } from './heatmap';
import type { Cycle } from './cycle';

// Cycle is exactly `{ key: string; start: string; end: string; label: string }` (from cycle.ts).
// Fully-typed literal — NO `as` (lint bans it).
const cycle: Cycle = { key: '2026-07', start: '2026-07-01', end: '2026-07-05', label: 'Jul' };

// Per-date spend, positive = spend — discretionaryByDate's shape.
function spend(...days: [string, number][]): Map<string, number> {
  return new Map(days);
}

describe('toHeatmapCells', () => {
  it('emits one cell per day in the cycle, empty days as zero', () => {
    const cells = toHeatmapCells(spend(['2026-07-02', 100]), cycle);
    expect(cells.map((c) => c.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ]);
    expect(cells[0]).toEqual({ date: '2026-07-01', total: 0, intensity: 0 });
    expect(cells[1]).toEqual({ date: '2026-07-02', total: 100, intensity: 4 });
  });

  it("buckets intensity 1..4 against the cycle's busiest day, 0 for empty", () => {
    const cells = toHeatmapCells(
      spend(['2026-07-01', 100], ['2026-07-02', 25], ['2026-07-03', 50]),
      cycle,
    );
    const byDate = new Map(cells.map((c) => [c.date, c.intensity] as const));
    expect(byDate.get('2026-07-01')).toBe(4); // busiest
    expect(byDate.get('2026-07-02')).toBe(1); // 25% of max
    expect(byDate.get('2026-07-03')).toBe(2); // 50% of max
    expect(byDate.get('2026-07-04')).toBe(0); // empty
  });

  it('crosses a month boundary, both endpoints inclusive', () => {
    const c: Cycle = { key: '2026-01', start: '2026-01-30', end: '2026-02-02', label: 'Jan' };
    const cells = toHeatmapCells(spend(['2026-01-31', 50]), c);
    expect(cells.map((x) => x.date)).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('rounds a non-quarter ratio UP (Math.ceil, not floor/round)', () => {
    const c: Cycle = { key: '2026-03', start: '2026-03-01', end: '2026-03-02', label: 'Mar' };
    // busiest day 100 → intensity 4; a day at 30% of max → 0.3×4 = 1.2 → ceil = 2 (floor/round = 1)
    const cells = toHeatmapCells(spend(['2026-03-01', 100], ['2026-03-02', 30]), c);
    const byDate = new Map(cells.map((x) => [x.date, x.intensity] as const));
    expect(byDate.get('2026-03-01')).toBe(4);
    expect(byDate.get('2026-03-02')).toBe(2);
  });

  it('clamps a net-refund day (negative spend) to zero, and it never sets the max', () => {
    const cells = toHeatmapCells(spend(['2026-07-02', -500], ['2026-07-03', 10]), cycle);
    expect(cells.find((c) => c.date === '2026-07-02')).toEqual({
      date: '2026-07-02',
      total: 0,
      intensity: 0,
    });
    expect(cells.find((c) => c.date === '2026-07-03')?.intensity).toBe(4);
  });
});
```

Leave the `cell()` helper and the `toCalendarLayout` describe (old lines 66–97) untouched.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/entries/heatmap.test.ts`
Expected: FAIL with `TypeError: dayGroups.map is not a function`, because `toHeatmapCells` still expects `DayGroup[]`.

- [ ] **Step 3: Change `toHeatmapCells` to take the spend map**

In `src/features/entries/heatmap.ts`, delete the `import type { DayGroup } from './by-date';` line
and replace the `toHeatmapCells` comment + function (old lines 20–33) with:

```ts
// One cell per day of the cycle — a calendar-grid glance at where a cycle's spending landed. Days
// with no entries are real zeros (kept, not skipped: a gap in the grid would read as a bug).
// `totals` is spend per day, positive = spend — discretionaryByDate's shape, so a posted bill or an
// off-budget purchase never darkens a day (a ฿20k rent day would otherwise pin the max and flatten
// every other day to intensity 1). A day whose refunds outweigh its spend is negative and clamps
// to 0. `intensity` buckets 1..4 against the cycle's busiest day (0 for an empty day), so the render
// maps it to a background without knowing any baht figure.
export function toHeatmapCells(totals: ReadonlyMap<string, number>, cycle: Cycle): HeatmapCell[] {
  const dates = eachDay(cycle.start, cycle.end);
  const spendOn = (date: string) => Math.max(0, totals.get(date) ?? 0);
  const max = Math.max(0, ...dates.map(spendOn));
  return dates.map((date) => {
    const total = spendOn(date);
    const intensity = max === 0 || total === 0 ? 0 : Math.min(4, Math.ceil((total / max) * 4));
    return { date, total, intensity };
  });
}
```

- [ ] **Step 4: Run the heatmap test to verify it passes**

Run: `npm test -- src/features/entries/heatmap.test.ts`
Expected: PASS (all `toHeatmapCells` and `toCalendarLayout` tests).

- [ ] **Step 5: Write the failing analytics test**

In `src/features/entries/use-analytics.test.ts`:

Add to the imports (after the `ensureBudgetsTable` import):

```ts
import { ensureCurrenciesTable } from '@features/currencies/schema';
```

Add `await ensureCurrenciesTable(db);` directly after EACH of the three `await ensureSettingsTable(db);`
lines (currently lines 31, 92 and 232). `getTravelCurrencies` seeds that table, so every setup needs it.

Add this test inside the first `describe('useAnalytics', …)`, right after the
`'exposes anchor-cycle heatmap cells and top-notes'` test:

```ts
  it('darkens the heatmap by discretionary spend only — bills and off-budget rows do not count', async () => {
    const db = await getBrowserDb();
    await addEntries(db, [
      // A posted bill and an off-budget purchase, both far bigger than the seeded Food ฿400.
      { date: '2026-07-22', account: 'Cash', category: 'Bills', amount: -9000, source: 'recurring' },
      { date: '2026-07-23', account: 'Cash', category: 'Gifts', amount: -5000, offBudget: 1 },
    ]);
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const byDate = new Map((result.current.data?.heatmapCells ?? []).map((c) => [c.date, c] as const));
    expect(byDate.get('2026-07-22')).toEqual({ date: '2026-07-22', total: 0, intensity: 0 });
    expect(byDate.get('2026-07-23')).toEqual({ date: '2026-07-23', total: 0, intensity: 0 });
    // With the bill out of the max, the Food ฿400 day is the busiest again.
    expect(byDate.get('2026-07-20')).toEqual({ date: '2026-07-20', total: 400, intensity: 4 });
  });
```

- [ ] **Step 6: Run the analytics tests to verify the new one fails**

Run: `npm test -- src/features/entries/use-analytics.test.ts`
Expected: FAIL across the file. `use-analytics` still hands the new `toHeatmapCells` a `DayGroup[]`, so the effect throws `totals.get is not a function`, `withDb` propagates it, and every test that waits for `ready` times out. That is the signal Step 7 is still to do. (`npm run typecheck` is also red between Step 3 and Step 7; that's expected.)

- [ ] **Step 7: Feed discretionary spend in `use-analytics.ts`**

In `src/features/entries/use-analytics.ts`:

Replace `import { getEmojiMap, getHueMap } from '@features/categories/queries';` with:

```ts
import { getEmojiMap, getHueMap, getOffBudgetCategories } from '@features/categories/queries';
import { getTravelCurrencies } from '@features/currencies/queries';
```

Replace `import { groupByDate } from './by-date';` with:

```ts
import { discretionaryByDate } from './off-budget';
```

Replace the settings `Promise.all` (old lines 117–124) with:

```ts
      const [
        cutoff,
        emojiMap,
        hueMap,
        iconSet,
        accountIconMap,
        accountHueMap,
        offBudgetCategories,
        travelCurrencies,
      ] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
        getAccountIconMap(db),
        getAccountHueMap(db),
        getOffBudgetCategories(db),
        getTravelCurrencies(db),
      ]);
```

Replace the `heatmapCells` line (old line 155) with:

```ts
      // Discretionary only, the same money the budget meter counts: a posted bill or an off-budget
      // purchase would otherwise pin the busiest day and flatten the rest of the grid.
      const heatmapCells = toHeatmapCells(
        discretionaryByDate(cycleEntries, offBudgetCategories, travelCurrencies),
        active,
      );
```

- [ ] **Step 8: Run the analytics tests to verify they pass**

Run: `npm test -- src/features/entries/use-analytics.test.ts src/features/entries/heatmap.test.ts`
Expected: PASS.

- [ ] **Step 9: Gates and commit**

```bash
npm run format:files src/features/entries/heatmap.ts src/features/entries/heatmap.test.ts src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/heatmap.ts src/features/entries/heatmap.test.ts src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
git commit -m "feat(features): darken the spend heatmap by discretionary spend" -m "A posted bill or an off-budget purchase set the busiest day, so one rent day flattened every other day to the lightest step. The heatmap now takes discretionaryByDate, the same money the budget meter counts, which is also what the Records calendar will draw."
```

---

### Task 2: Calendar marks and selected-day resolution

**Files:**
- Create: `src/features/entries/calendar-marks.ts`
- Test: `src/features/entries/calendar-marks.test.ts`

**Interfaces:**
- Consumes: `isFixed(entry: EntryRow): boolean`, `isOffBudget(entry, offBudgetCategories: Set<string>, travelCurrencies: Set<string>): boolean` (`./off-budget`); `eachDay(start, end): string[]` (`./heatmap`); `Cycle` (`./cycle`); `EntryRow` (`./schema`).
- Produces:
  - `type DayMarks = { posted: boolean; upcoming: boolean; offBudget: boolean }`
  - `dayMarks(entries: EntryRow[], upcomingDates: readonly string[], offBudgetCategories: Set<string>, travelCurrencies: Set<string>): Map<string, DayMarks>`. Only days with at least one mark are keys.
  - `resolveSelectedDay(dayParam: string | undefined, cycle: Cycle, today: string): string`

- [ ] **Step 1: Write the failing tests**

Create `src/features/entries/calendar-marks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dayMarks, resolveSelectedDay } from './calendar-marks';
import type { EntryRow } from './schema';
import type { Cycle } from './cycle';

function entry(date: string, amount: number, over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 1,
    date,
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: 'THB',
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
    category: 'Food',
    account: 'Cash',
    ...over,
  };
}

const NO_SETS = [new Set<string>(), new Set<string>()] as const;

describe('dayMarks', () => {
  it('marks a posted recurring bill', () => {
    const marks = dayMarks([entry('2026-07-02', -1000, { source: 'recurring' })], [], ...NO_SETS);
    expect(marks.get('2026-07-02')).toEqual({ posted: true, upcoming: false, offBudget: false });
  });

  it('marks off-budget spend, from the entry flag or the category default', () => {
    const marks = dayMarks(
      [entry('2026-07-03', -500, { offBudget: 1 }), entry('2026-07-04', -80, { category: 'Gifts' })],
      [],
      new Set(['Gifts']),
      new Set<string>(),
    );
    expect(marks.get('2026-07-03')).toEqual({ posted: false, upcoming: false, offBudget: true });
    expect(marks.get('2026-07-04')).toEqual({ posted: false, upcoming: false, offBudget: true });
  });

  it('gives a recurring row in an off-budget category the off-budget mark only', () => {
    // Same precedence as splitBudgetSpend: off-budget is checked first.
    const marks = dayMarks(
      [entry('2026-07-05', -300, { source: 'recurring', offBudget: 1 })],
      [],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-05')).toEqual({ posted: false, upcoming: false, offBudget: true });
  });

  it('marks upcoming bill dates and merges kinds on the same day', () => {
    const marks = dayMarks(
      [entry('2026-07-10', -40, { offBudget: 1 })],
      ['2026-07-10', '2026-07-12'],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-10')).toEqual({ posted: false, upcoming: true, offBudget: true });
    expect(marks.get('2026-07-12')).toEqual({ posted: false, upcoming: true, offBudget: false });
  });

  it('leaves an ordinary spending day unmarked', () => {
    expect(dayMarks([entry('2026-07-01', -100)], [], ...NO_SETS).has('2026-07-01')).toBe(false);
  });
});

// Cutoff 18: cycle '2026-06' runs 18 Jun – 17 Jul.
const cycle: Cycle = { key: '2026-06', start: '2026-06-18', end: '2026-07-17', label: 'Jun' };

describe('resolveSelectedDay', () => {
  it('keeps a ?day= inside the cycle', () => {
    expect(resolveSelectedDay('2026-06-20', cycle, '2026-07-05')).toBe('2026-06-20');
  });

  it('falls back to today when ?day= is missing, outside the cycle, or not a real day', () => {
    expect(resolveSelectedDay(undefined, cycle, '2026-07-05')).toBe('2026-07-05');
    expect(resolveSelectedDay('2026-07-18', cycle, '2026-07-05')).toBe('2026-07-05');
    expect(resolveSelectedDay('2026-06-31', cycle, '2026-07-05')).toBe('2026-07-05');
  });

  it("falls back to the cycle's last day when today is not in it (a past cycle)", () => {
    expect(resolveSelectedDay(undefined, cycle, '2026-08-01')).toBe('2026-07-17');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/entries/calendar-marks.test.ts`
Expected: FAIL with "Failed to resolve import './calendar-marks'" (or "Cannot find module").

- [ ] **Step 3: Implement `calendar-marks.ts`**

Create `src/features/entries/calendar-marks.ts`:

```ts
import type { EntryRow } from './schema';
import type { Cycle } from './cycle';
import { eachDay } from './heatmap';
import { isFixed, isOffBudget } from './off-budget';

// Which kinds of money moved on a day, for the Records calendar's glyph marks. Colour is not used:
// hue already means category, the accent means action, and cell darkness means discretionary spend.
export type DayMarks = { posted: boolean; upcoming: boolean; offBudget: boolean };

const NONE: DayMarks = { posted: false, upcoming: false, offBudget: false };

// Marks per day, keyed 'YYYY-MM-DD'; a day with no mark is absent. Off-budget is checked before fixed,
// the same precedence as splitBudgetSpend, so a recurring bill in an off-budget category shows ◆ only
// and one row never earns two marks. `upcomingDates` are the not-yet-posted rule dates the caller got
// from postsBetween — passed in as plain dates so this module never needs the recurring rule shape.
export function dayMarks(
  entries: EntryRow[],
  upcomingDates: readonly string[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): Map<string, DayMarks> {
  const out = new Map<string, DayMarks>();
  const mark = (date: string, patch: Partial<DayMarks>) =>
    out.set(date, { ...(out.get(date) ?? NONE), ...patch });
  for (const e of entries) {
    if (isOffBudget(e, offBudgetCategories, travelCurrencies)) mark(e.date, { offBudget: true });
    else if (isFixed(e)) mark(e.date, { posted: true });
  }
  for (const date of upcomingDates) mark(date, { upcoming: true });
  return out;
}

// The day the calendar opens on. A ?day= is honoured only if it is a real day of this cycle — checked
// against the cycle's own day list, so '2026-06-31' or a stale day from another cycle cannot select a
// cell that doesn't exist. Otherwise today when it falls in the cycle, else the cycle's last day.
export function resolveSelectedDay(
  dayParam: string | undefined,
  cycle: Cycle,
  today: string,
): string {
  const days = eachDay(cycle.start, cycle.end);
  if (dayParam !== undefined && days.includes(dayParam)) return dayParam;
  return days.includes(today) ? today : cycle.end;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/entries/calendar-marks.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Gates and commit**

```bash
npm run format:files src/features/entries/calendar-marks.ts src/features/entries/calendar-marks.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/calendar-marks.ts src/features/entries/calendar-marks.test.ts
git commit -m "feat(features): derive per-day calendar marks" -m "Posted bill, upcoming bill and off-budget marks for the Records calendar, all derived from data already stored (source, off_budget, rule schedule), plus the rule for which day the calendar opens on."
```

---

### Task 3: Shared `CalendarGrid` with a contrast-safe ramp

**Files:**
- Create: `src/features/entries/ui/CalendarGrid.tsx`
- Test: `src/features/entries/ui/CalendarGrid.test.tsx`
- Modify: `src/features/entries/ui/SpendHeatmap.tsx` (whole file)
- Modify: `src/app/globals.test.ts` (import + new describe at the end)

**Interfaces:**
- Consumes: `HeatmapCell`, `toCalendarLayout` (`../heatmap`); `DayMarks` (`../calendar-marks`, Task 2).
- Produces:
  - `RAMP: readonly { mix: number; ink: 'muted' | 'text' | 'surface' }[]` (5 steps, index = intensity)
  - `DayMark({ kind }: { kind: keyof DayMarks })`, the glyph used by the grid, its legend, and Task 5's bill rows
  - `CalendarGrid({ cells, marks?, selectedDay?, hrefFor? }: { cells: HeatmapCell[]; marks?: ReadonlyMap<string, DayMarks>; selectedDay?: string; hrefFor?: (date: string) => string })`
  - `SpendHeatmap({ cells })`, same props as today

Why the ramp changes: today intensity 4 paints `--color-text` behind a `--color-text` number
(invisible), and no single ink clears 4.5:1 on a 50% step in both themes (light: text 4.85 /
surface 3.79; dark: text 3.01 / surface 4.88). Steps 0/15/30/65/100 with inks
muted/text/text/surface/surface clear it in both themes (worst: 30% dark text 5.34, 65% light
surface 6.17). The mix moves from `oklab` to `srgb` so the test's per-channel `composite()` equals
what the browser paints.

- [ ] **Step 1: Write the failing contrast test**

In `src/app/globals.test.ts`, add after `import { SLICE_COLORS } from '@features/entries/donut';`:

```ts
import { RAMP } from '@features/entries/ui/CalendarGrid';
```

Append at the end of the file:

```ts
// The calendar heatmap draws its day number (and mark glyphs) ON a mix of --color-text into
// --color-surface-2, so each step's ink must clear AA against its own background in both themes.
// The old ramp painted --color-text on --color-text at the busiest step, an invisible number.
describe('calendar heatmap ramp', () => {
  it.each(RAMP.map((step, level) => ({ level, ...step })))(
    'level $level ($ink on $mix%) clears 4.5:1 in both themes',
    ({ mix, ink }) => {
      for (const theme of THEMES) {
        const bg = composite(token('color-text', theme), token('color-surface-2', theme), mix / 100);
        const fg = token(`color-${ink}`, theme);
        expect(contrast(fg, bg), `${ink} on ${mix}% (${theme})`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );
});
```

- [ ] **Step 2: Write the failing grid render tests**

Create `src/features/entries/ui/CalendarGrid.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarGrid } from './CalendarGrid';
import type { DayMarks } from '../calendar-marks';

const cells = [
  { date: '2026-07-16', total: 0, intensity: 0 },
  { date: '2026-07-17', total: 240, intensity: 4 },
];
const marks = new Map<string, DayMarks>([
  ['2026-07-17', { posted: true, upcoming: false, offBudget: true }],
]);

describe('CalendarGrid', () => {
  it('renders plain cells when there is no hrefFor (Trends)', () => {
    render(<CalendarGrid cells={cells} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByLabelText('Fri 17 Jul: ฿240')).toHaveTextContent('17');
    // An empty day stays out of the accessibility tree, as before.
    expect(screen.queryByLabelText(/16 Jul/)).toBeNull();
  });

  it('links every day, names its marks in words, and flags the selected day', () => {
    render(
      <CalendarGrid
        cells={cells}
        marks={marks}
        selectedDay="2026-07-17"
        hrefFor={(d) => `/records?day=${d}`}
      />,
    );
    const busy = screen.getByRole('link', { name: 'Fri 17 Jul: ฿240, bill posted, off-budget' });
    expect(busy).toHaveAttribute('href', '/records?day=2026-07-17');
    expect(busy).toHaveAttribute('aria-current', 'date');
    const empty = screen.getByRole('link', { name: 'Thu 16 Jul: no spending' });
    expect(empty).not.toHaveAttribute('aria-current');
  });

  it('lists only the mark kinds that appear in the legend', () => {
    render(<CalendarGrid cells={cells} marks={marks} hrefFor={(d) => d} />);
    expect(screen.getByText('Bill posted')).toBeInTheDocument();
    expect(screen.getByText('Off-budget')).toBeInTheDocument();
    expect(screen.queryByText('Bill due')).toBeNull();
  });

  it('draws no legend without marks', () => {
    render(<CalendarGrid cells={cells} />);
    expect(screen.queryByText('Bill posted')).toBeNull();
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npm test -- src/app/globals.test.ts src/features/entries/ui/CalendarGrid.test.tsx`
Expected: FAIL. Neither file can resolve `./CalendarGrid` / `@features/entries/ui/CalendarGrid`.

- [ ] **Step 4: Create `CalendarGrid.tsx`**

Create `src/features/entries/ui/CalendarGrid.tsx`:

```tsx
import Link from 'next/link';
import type { HeatmapCell } from '../heatmap';
import { toCalendarLayout } from '../heatmap';
import type { DayMarks } from '../calendar-marks';
import { formatBahtWhole } from '@shared/money';
import { formatDayHeading } from '@shared/date';

type Ink = 'muted' | 'text' | 'surface';

// intensity 0..4 → how much --color-text is mixed into --color-surface-2, and which ink the day number
// and its marks draw in on top. Hue-free, so category colour keeps its meaning. Each ink is pinned
// against its own background in globals.test.ts (4.5:1, both themes): the midpoint of the old
// 25/50/75 ramp had NO ink that cleared both themes, and the top step drew text on text. `srgb`, not
// `oklab`, so the test's per-channel composite is exactly what the browser paints.
export const RAMP = [
  { mix: 0, ink: 'muted' },
  { mix: 15, ink: 'text' },
  { mix: 30, ink: 'text' },
  { mix: 65, ink: 'surface' },
  { mix: 100, ink: 'surface' },
] as const satisfies readonly { mix: number; ink: Ink }[];

function background(mix: number): string {
  return mix === 0
    ? 'var(--color-surface-2)'
    : `color-mix(in srgb, var(--color-text) ${mix}%, var(--color-surface-2))`;
}

// Sunday-started narrow weekday labels (S M T W T F S), derived via Intl from a known Sunday
// (2023-01-01) rather than hard-coded letters, so they stay correct if the locale ever changes.
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' });
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  weekdayFmt.format(new Date(Date.UTC(2023, 0, 1 + i))),
);

// The day-of-month for a YYYY-MM-DD key (the trailing DD as a number — no zero-pad to display).
function dayOfMonth(date: string): number {
  return Number(date.split('-')[2]);
}

const KINDS = ['posted', 'upcoming', 'offBudget'] as const;
const WORDS: Record<keyof DayMarks, string> = {
  posted: 'bill posted',
  upcoming: 'bill due',
  offBudget: 'off-budget',
};
const LEGEND: Record<keyof DayMarks, string> = {
  posted: 'Bill posted',
  upcoming: 'Bill due',
  offBudget: 'Off-budget',
};

// A 6px CSS shape in currentColor — filled dot, ring, diamond — rather than a ●○◆ text glyph, whose
// size and even presence vary by font fallback. Inherits the cell ink, so it carries the ramp's
// contrast guarantee for free.
export function DayMark({ kind }: { kind: keyof DayMarks }) {
  const shape =
    kind === 'posted'
      ? 'rounded-full bg-current'
      : kind === 'upcoming'
        ? 'rounded-full border border-current'
        : 'rotate-45 bg-current';
  return <span aria-hidden="true" className={`block size-1.5 shrink-0 ${shape}`} />;
}

// A real month-calendar of a billing cycle: weekday columns, each day under its own weekday, darker =
// more discretionary spend, glyph marks for bills and off-budget. Days run continuously across the
// month boundary (…31, 1…) because the cycle is a billing cycle, not a calendar month.
//
// Two modes. Without `hrefFor` (Trends) it is a non-interactive glance, as it always was: empty days
// are aria-hidden. With `hrefFor` (Records) every day is a link that selects it — `replace` so tapping
// through days doesn't fill the back stack, `scroll={false}` so the grid doesn't jump to the top — and
// every day names its figure and marks in words.
export function CalendarGrid({
  cells,
  marks,
  selectedDay,
  hrefFor,
}: {
  cells: HeatmapCell[];
  marks?: ReadonlyMap<string, DayMarks>;
  selectedDay?: string;
  hrefFor?: (date: string) => string;
}) {
  const layout = toCalendarLayout(cells);
  const allMarks = [...(marks?.values() ?? [])];
  const present = KINDS.filter((k) => allMarks.some((m) => m[k]));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className="text-center text-[11px]"
            style={{ color: 'var(--color-muted)' }}
            aria-hidden="true"
          >
            {w}
          </span>
        ))}
        {layout.map((c, i) => {
          if (c === null) return <span key={`pad-${i}`} aria-hidden="true" />;
          const step = RAMP[c.intensity] ?? RAMP[0];
          const kinds = KINDS.filter((k) => marks?.get(c.date)?.[k] === true);
          const spent = c.total > 0;
          const figure = spent ? formatBahtWhole(c.total) : 'no spending';
          const label = [`${formatDayHeading(c.date)}: ${figure}`, ...kinds.map((k) => WORDS[k])].join(
            ', ',
          );
          const selected = c.date === selectedDay;
          const className = `tnum flex aspect-square flex-col items-center justify-center gap-0.5 rounded text-[11px]${
            selected ? ' outline-2 outline-offset-1' : ''
          }`;
          const style = {
            background: background(step.mix),
            color: `var(--color-${step.ink})`,
            outlineColor: 'var(--color-text)',
          };
          const body = (
            <>
              <span>{dayOfMonth(c.date)}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {kinds.map((k) => (
                  <DayMark key={k} kind={k} />
                ))}
              </span>
            </>
          );
          if (hrefFor !== undefined) {
            return (
              <Link
                key={c.date}
                href={hrefFor(c.date)}
                replace
                scroll={false}
                prefetch={false}
                aria-label={label}
                aria-current={selected ? 'date' : undefined}
                className={className}
                style={style}
              >
                {body}
              </Link>
            );
          }
          return (
            <span
              key={c.date}
              className={className}
              style={style}
              title={spent ? label : undefined}
              aria-label={spent ? label : undefined}
              aria-hidden={spent ? undefined : true}
            >
              {body}
            </span>
          );
        })}
      </div>
      {present.length > 0 ? (
        <p
          className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs"
          style={{ color: 'var(--color-muted)' }}
        >
          {present.map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <DayMark kind={k} />
              {LEGEND[k]}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Make `SpendHeatmap` a wrapper around the grid**

Replace the whole of `src/features/entries/ui/SpendHeatmap.tsx` with:

```tsx
import type { HeatmapCell } from '../heatmap';
import { CalendarGrid } from './CalendarGrid';

// The Trends card: a non-interactive glance at where the anchor cycle's discretionary spending fell.
// The grid itself is shared with the Records calendar (CalendarGrid), which adds marks and tap-to-select.
export function SpendHeatmap({ cells }: { cells: HeatmapCell[] }) {
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Daily spending this cycle">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Daily spending
      </h2>
      <CalendarGrid cells={cells} />
    </section>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- src/app/globals.test.ts src/features/entries/ui/CalendarGrid.test.tsx src/features/entries/ui/SpendHeatmap.test.tsx`
Expected: PASS, including the 5 `calendar heatmap ramp` cases and the unchanged `SpendHeatmap` tests.

- [ ] **Step 7: Gates and commit**

```bash
npm run format:files src/features/entries/ui/CalendarGrid.tsx src/features/entries/ui/CalendarGrid.test.tsx src/features/entries/ui/SpendHeatmap.tsx src/app/globals.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/CalendarGrid.tsx src/features/entries/ui/CalendarGrid.test.tsx src/features/entries/ui/SpendHeatmap.tsx src/app/globals.test.ts
git commit -m "fix(features): keep heatmap day numbers readable on every step" -m "The busiest step painted --color-text behind a --color-text number, and no single ink cleared AA on the 50% step in both themes. The grid moves into a shared CalendarGrid with a re-stepped srgb ramp whose per-step ink is asserted in globals.test.ts, and gains optional marks and tap-to-select for the Records calendar."
```

---

### Task 4: `useRecords` builds the calendar payload

**Files:**
- Modify: `src/features/entries/use-records.ts`
- Create: `src/features/entries/use-records-calendar.test.ts`
- Modify: `src/app/records/page.test.tsx` (fixture only: add `calendar: null`)

**Interfaces:**
- Consumes: `toHeatmapCells(totals, cycle)` (Task 1); `dayMarks`, `resolveSelectedDay`, `DayMarks` (Task 2); `discretionaryByDate` (`./off-budget`); `getOffBudgetCategories` (`@features/categories/queries`); `getTravelCurrencies` (`@features/currencies/queries`); `listRules(db): Promise<Recurrence[]>`, `listRuleMeta(db): Promise<RuleMeta[]>` (`@features/recurring/queries`); `postsBetween(rule, afterIso, throughIso): Due[]` (`@features/recurring/schedule`; dates strictly after `afterIso`).
- Produces (exported from `use-records.ts`):
  - `type RecordsGroupBy = 'date' | 'category' | 'account' | 'calendar'`
  - `type UpcomingBill = { id: number; name: string; category: string | null; amount: number; currency: string }`. `amount` is a positive magnitude. `currency` is `'THB'` for THB and pinned-rate bills (amount already in baht), or the rule's own code for a blank-rate foreign bill (amount in that currency).
  - `type RecordsCalendar = { cells: HeatmapCell[]; marks: Map<string, DayMarks>; selectedDay: string; dayEntries: EntryRow[]; dayTotal: number; dayBills: UpcomingBill[] }`
  - `RecordsParams.day?: string`; `RecordsData.calendar: RecordsCalendar | null`

- [ ] **Step 1: Write the failing hook tests**

Create `src/features/entries/use-records-calendar.test.ts`. It is a separate file from
`use-records.test.ts` because it pins `todayIso`, and that mock would leak into the existing tests.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { addEntries } from './queries';
import { addRule } from '@features/recurring/queries';
import { categoryIdFor } from '@features/categories/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-05'),
}));

import { getBrowserDb } from '@db/browser';
import { useRecords, type RecordsParams } from './use-records';

// Cutoff defaults to 18 and today is pinned to 2026-07-05, so the current cycle is '2026-06'
// (18 Jun – 17 Jul, 30 days).
describe('useRecords — calendar view', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureRecurrencesTable(db);
    await ensureCurrenciesTable(db);
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -40 },
      { date: '2026-07-02', account: 'Cash', category: 'Bills', amount: -1000, source: 'recurring' },
      { date: '2026-07-03', account: 'Cash', category: 'Food', amount: -500, offBudget: 1 },
    ]);
    // A ฿419 bill due the 10th: after today, inside the cycle, never posted.
    await addRule(db, {
      name: 'Netflix',
      day: 10,
      intervalMonths: 1,
      amount: 419,
      categoryId: await categoryIdFor(db, 'Bills'),
      startDate: '2026-07-10',
      lastPosted: null,
    });
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  async function load(params: RecordsParams) {
    const { result } = renderHook(() => useRecords(params));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const data = result.current.data;
    if (data === null) throw new Error('unreachable — ready implies data');
    return data;
  }

  it('builds cells from discretionary spend and marks each kind of day', async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar' });
    expect(data.groupBy).toBe('calendar');
    const cal = data.calendar;
    if (cal === null) throw new Error('calendar view should build a calendar');
    expect(cal.cells).toHaveLength(30);
    const cell = (d: string) => cal.cells.find((c) => c.date === d);
    expect(cell('2026-07-01')).toEqual({ date: '2026-07-01', total: 140, intensity: 4 });
    expect(cell('2026-07-02')?.total).toBe(0); // a posted bill is not discretionary
    expect(cell('2026-07-03')?.total).toBe(0); // nor is off-budget spend
    expect(cal.marks.get('2026-07-02')).toEqual({ posted: true, upcoming: false, offBudget: false });
    expect(cal.marks.get('2026-07-03')).toEqual({ posted: false, upcoming: false, offBudget: true });
    expect(cal.marks.get('2026-07-10')).toEqual({ posted: false, upcoming: true, offBudget: false });
    expect(cal.marks.has('2026-07-01')).toBe(false);
  });

  it('opens on today by default', async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar' });
    expect(data.calendar?.selectedDay).toBe('2026-07-05');
    expect(data.calendar?.dayEntries).toEqual([]);
  });

  it("lists the selected day's entries newest first with their total", async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar', day: '2026-07-01' });
    const cal = data.calendar;
    if (cal === null) throw new Error('calendar view should build a calendar');
    expect(cal.selectedDay).toBe('2026-07-01');
    expect(cal.dayEntries.map((e) => e.amount)).toEqual([-40, -100]);
    expect(cal.dayTotal).toBe(-140);
    expect(cal.dayBills).toEqual([]);
  });

  it('lists an upcoming bill under its due day, in baht', async () => {
    const data = await load({ cycle: '2026-06', view: 'calendar', day: '2026-07-10' });
    expect(data.calendar?.dayBills).toEqual([
      { id: expect.any(Number), name: 'Netflix', category: 'Bills', amount: 419, currency: 'THB' },
    ]);
  });

  it('narrows upcoming bills by the category filter', async () => {
    const food = await load({ cycle: '2026-06', view: 'calendar', day: '2026-07-10', category: 'Food' });
    expect(food.calendar?.dayBills).toEqual([]);
    expect(food.calendar?.marks.has('2026-07-10')).toBe(false);
    const bills = await load({ cycle: '2026-06', view: 'calendar', day: '2026-07-10', category: 'Bills' });
    expect(bills.calendar?.dayBills.map((b) => b.name)).toEqual(['Netflix']);
  });

  it('keeps date grouping and no calendar in search mode', async () => {
    const data = await load({ q: 'anything', view: 'calendar' });
    expect(data.groupBy).toBe('date');
    expect(data.calendar).toBeNull();
  });

  it('builds no calendar for the other views', async () => {
    const data = await load({ cycle: '2026-06' });
    expect(data.calendar).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/entries/use-records-calendar.test.ts`
Expected: FAIL. `data.groupBy` is `'date'` rather than `'calendar'`, and `data.calendar` is `undefined`.

- [ ] **Step 3: Extend `use-records.ts`**

In `src/features/entries/use-records.ts`:

Replace the imports block (lines 3–15) with:

```ts
import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntriesInRange, searchEntries, getEntriesByCategory, getTripEntries } from './queries';
import type { EntryRow } from './schema';
import { groupByDate } from './by-date';
import { groupBySpend } from './by-spend';
import { cycleFromKey, currentCycleKey } from './cycle';
import { sumByCurrency, type CurrencySum } from './trips';
import { toHeatmapCells, type HeatmapCell } from './heatmap';
import { dayMarks, resolveSelectedDay, type DayMarks } from './calendar-marks';
import { discretionaryByDate } from './off-budget';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap, getOffBudgetCategories } from '@features/categories/queries';
import { getAccountIconMap, getAccountHueMap } from '@features/accounts/queries';
import { getTravelCurrencies } from '@features/currencies/queries';
import { listRules, listRuleMeta, type RuleMeta } from '@features/recurring/queries';
import type { Recurrence } from '@features/recurring/schema';
import { postsBetween } from '@features/recurring/schedule';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
```

(The explicit `Recurrence[]` / `RuleMeta[]` annotations below matter: without them the `: []`
branch types as `never[]`, and calling `.flatMap` on a `Recurrence[] | never[]` union can fail
typecheck.)

Add `day?: string;` as the last field of `RecordsParams`:

```ts
  page?: string;
  day?: string;
};
```

Replace the `RecordsGroupBy` comment + type (lines 44–46) with:

```ts
// The Records group-by tab. One value rather than a set of booleans, which would admit illegal
// combinations; `?view=` carries it in the URL and anything unrecognised falls back to 'date'.
// 'calendar' exists only in the plain cycle view (not search/trip/all-category, not sort=amount).
export type RecordsGroupBy = 'date' | 'category' | 'account' | 'calendar';

// A recurring bill that has not posted yet, shown under its due day. `amount` is a positive magnitude:
// baht for a THB or pinned-rate rule (currency 'THB'), or the rule's own currency for a blank-rate
// foreign rule, which a pure preview cannot convert (committedThisCycle's byCurrency rule).
export type UpcomingBill = {
  id: number;
  name: string;
  category: string | null;
  amount: number;
  currency: string;
};

export type RecordsCalendar = {
  cells: HeatmapCell[];
  marks: Map<string, DayMarks>;
  selectedDay: string;
  // The selected day's entries, newest first, and their plain sum (the rows' own frame).
  dayEntries: EntryRow[];
  dayTotal: number;
  dayBills: UpcomingBill[];
};
```

Add to `RecordsData`, after `pageCount: number;`:

```ts
  // Built only for the calendar view; null for every other view, so their reads cost nothing extra.
  calendar: RecordsCalendar | null;
```

Add `day` to the params destructure (after `page: pageParam,`):

```ts
    page: pageParam,
    day,
  } = params;
```

Replace the `groupBy` computation and the `grouped` ternary (old lines 154–169) with:

```ts
      const groupBy: RecordsGroupBy =
        view === 'category'
          ? 'category'
          : view === 'account'
            ? 'account'
            : view === 'calendar' && !spanAll && !sortByAmount
              ? 'calendar'
              : 'date';
      // Each section carries its own foreign-currency subtotals so any header — a day, a category, or
      // an account — can read "¥12,000  ฿2,800" when it holds foreign spending; empty otherwise.
      // Date ranks chronologically; category and account both rank by spend, so they share groupBySpend.
      // The calendar renders its own day list, but keeps day sections so `sections.length` still means
      // "this cycle has rows".
      const grouped = sortByAmount
        ? [
            {
              key: 'amount',
              entries: [...cycleEntries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
              total: cycleEntries.reduce((sum, e) => sum + e.amount, 0),
            },
          ]
        : groupBy === 'date' || groupBy === 'calendar'
          ? groupByDate(visible).map((g) => ({ key: g.date, entries: g.entries, total: g.total }))
          : groupBySpend(visible, groupBy === 'category' ? (e) => e.category : (e) => e.account);
```

Insert right after `const currencySums = sumByCurrency(entries);`:

```ts
      let calendar: RecordsCalendar | null = null;
      if (groupBy === 'calendar') {
        const today = todayIso();
        const [offBudgetCategories, travelCurrencies] = await Promise.all([
          getOffBudgetCategories(db),
          getTravelCurrencies(db),
        ]);
        // Only the current cycle has days after today; a past cycle's bills have all posted, so its
        // rules aren't read at all.
        const isCurrent = activeKey === currentKey;
        const rules: Recurrence[] = isCurrent ? await listRules(db) : [];
        const ruleMeta: RuleMeta[] = isCurrent ? await listRuleMeta(db) : [];
        const metaById = new Map(ruleMeta.map((m) => [m.id, m] as const));
        const bills = rules.flatMap((rule) => {
          const meta = metaById.get(rule.id);
          const categoryName = meta?.categoryName ?? null;
          // The same chips as the ledger rows, matched on the rule's resolved names.
          if (category && categoryName !== category) return [];
          if (account && (meta?.accountName ?? null) !== account) return [];
          const inBaht = rule.currency === null || rule.currency === 'THB' || rule.rate !== null;
          const bill: UpcomingBill = {
            id: rule.id,
            name: rule.name,
            category: categoryName,
            amount: inBaht ? rule.amount * (rule.rate ?? 1) : rule.amount,
            currency: inBaht ? 'THB' : (rule.currency ?? 'THB'),
          };
          return postsBetween(rule, today, cycle.end).map((due) => ({ date: due.date, bill }));
        });
        const selectedDay = resolveSelectedDay(day, cycle, today);
        const dayEntries = ordered.filter((e) => e.date === selectedDay);
        calendar = {
          cells: toHeatmapCells(
            discretionaryByDate(cycleEntries, offBudgetCategories, travelCurrencies),
            cycle,
          ),
          marks: dayMarks(
            cycleEntries,
            bills.map((b) => b.date),
            offBudgetCategories,
            travelCurrencies,
          ),
          selectedDay,
          dayEntries,
          dayTotal: dayEntries.reduce((sum, e) => sum + e.amount, 0),
          dayBills: bills.filter((b) => b.date === selectedDay).map((b) => b.bill),
        };
      }
```

Add `calendar,` to the `setData({...})` object after `pageCount,`, and add `day` to the effect's
dependency array:

```ts
  }, [cycleParam, category, account, q, view, all, currency, from, to, sort, pageParam, day, version]);
```

- [ ] **Step 4: Keep the page test fixture typed**

In `src/app/records/page.test.tsx`, inside `function data(): RecordsData`, add after `pageCount: 1,`:

```ts
    calendar: null,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- src/features/entries/use-records-calendar.test.ts src/features/entries/use-records.test.ts src/app/records/page.test.tsx`
Expected: PASS (the 7 new tests and every existing Records test).

- [ ] **Step 6: Gates and commit**

```bash
npm run format:files src/features/entries/use-records.ts src/features/entries/use-records-calendar.test.ts src/app/records/page.test.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/use-records.ts src/features/entries/use-records-calendar.test.ts src/app/records/page.test.tsx
git commit -m "feat(features): load a calendar payload for the Records view" -m "?view=calendar now yields discretionary day cells, per-day marks, the selected day's entries and its upcoming bills. The extra reads (off-budget sets, rules) run only for this view, and rules only for the current cycle."
```

---

### Task 5: Records calendar UI

**Files:**
- Create: `src/features/entries/ui/RecordsCalendar.tsx`
- Test: `src/features/entries/ui/RecordsCalendar.test.tsx`
- Modify: `src/app/records/page.tsx`
- Modify: `src/app/records/page.test.tsx` (new describe)

**Interfaces:**
- Consumes: `RecordsCalendar` and `UpcomingBill` types (Task 4); `CalendarGrid`, `DayMark` (Task 3); `SwipeRow({ entry, emoji, iconSet, hue? })`; `CategoryIcon({ emoji, name, size?, iconSet?, hue? })` (`@features/categories/ui/CategoryIcon`); `emojiFor(map, name): string`, `hueFor(map, name): number | undefined` (`@features/categories/queries`); `Money` (`@shared/ui/Money`); `formatLedgerSpend` (`@shared/money`); `formatForeign(amount, currency)` (`../trips`); `formatDayHeading` (`@shared/date`).
- Produces: `RecordsCalendar({ calendar, hrefFor, emojiMap, hueMap, iconSet })`. The page imports it as `RecordsCalendarView` so it doesn't clash with the type name.

- [ ] **Step 1: Write the failing component tests**

Create `src/features/entries/ui/RecordsCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EntryRow } from '../schema';
import type { RecordsCalendar as CalendarData } from '../use-records';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import { RecordsCalendar } from './RecordsCalendar';

const LUNCH: EntryRow = {
  id: 1,
  date: '2026-07-10',
  time: null,
  accountId: 1,
  categoryId: 1,
  amount: -240,
  currency: 'THB',
  originalAmount: null,
  note: 'Lunch',
  source: 'manual',
  offBudget: null,
  category: 'Food',
  account: 'Cash',
};

function calendar(over: Partial<CalendarData> = {}): CalendarData {
  return {
    cells: [{ date: '2026-07-10', total: 240, intensity: 4 }],
    marks: new Map(),
    selectedDay: '2026-07-10',
    dayEntries: [LUNCH],
    dayTotal: -240,
    dayBills: [
      { id: 7, name: 'Netflix', category: 'Bills', amount: 419, currency: 'THB' },
      { id: 8, name: 'GitHub', category: 'Bills', amount: 4, currency: 'USD' },
    ],
    ...over,
  };
}

function renderCalendar(data: CalendarData): void {
  render(
    <CategoryPickerProvider iconSet="emoji">
      <RecordsCalendar
        calendar={data}
        hrefFor={(d) => `/records?view=calendar&day=${d}`}
        emojiMap={{}}
        hueMap={{}}
        iconSet="emoji"
      />
    </CategoryPickerProvider>,
  );
}

describe('RecordsCalendar', () => {
  it('heads the list with the selected day and its total', () => {
    renderCalendar(calendar());
    expect(screen.getByRole('heading', { name: /Fri 10 Jul/ })).toBeInTheDocument();
    expect(screen.getByText('Lunch')).toBeInTheDocument();
  });

  it('lists upcoming bills as links to their rule, in baht or their own currency', () => {
    renderCalendar(calendar());
    const netflix = screen.getByRole('link', { name: /Netflix/ });
    expect(netflix).toHaveAttribute('href', '/recurring/edit?id=7');
    expect(netflix).toHaveTextContent('฿419');
    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveTextContent('$4');
  });

  it('says so when the day has nothing', () => {
    renderCalendar(calendar({ dayEntries: [], dayTotal: 0, dayBills: [] }));
    expect(screen.getByText('Nothing on this day')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/entries/ui/RecordsCalendar.test.tsx`
Expected: FAIL with "Failed to resolve import './RecordsCalendar'".

- [ ] **Step 3: Create `RecordsCalendar.tsx`**

Create `src/features/entries/ui/RecordsCalendar.tsx`:

```tsx
import Link from 'next/link';
import type { RecordsCalendar as CalendarData } from '../use-records';
import type { IconSet } from '@features/settings/queries';
import { emojiFor, hueFor } from '@features/categories/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { formatDayHeading } from '@shared/date';
import { formatLedgerSpend } from '@shared/money';
import { Money } from '@shared/ui/Money';
import { formatForeign } from '../trips';
import { CalendarGrid, DayMark } from './CalendarGrid';
import { SwipeRow } from './SwipeRow';

// The Records calendar: the cycle as a tappable month grid, then the selected day's rows. Entries use
// the same SwipeRow as every other Records view (tap to edit, swipe to delete, Undo). Upcoming bills
// come last as muted rows that open their rule. They have not happened, so they stay out of the day
// total.
export function RecordsCalendar({
  calendar,
  hrefFor,
  emojiMap,
  hueMap,
  iconSet,
}: {
  calendar: CalendarData;
  hrefFor: (date: string) => string;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
}) {
  const { cells, marks, selectedDay, dayEntries, dayTotal, dayBills } = calendar;
  const heading = formatDayHeading(selectedDay);
  return (
    <>
      <section className="panel p-3" aria-label="Calendar">
        <CalendarGrid cells={cells} marks={marks} selectedDay={selectedDay} hrefFor={hrefFor} />
      </section>
      <section className="flex flex-col gap-2" aria-label={`Records on ${heading}`}>
        <div className="flex items-baseline justify-between gap-2 px-1">
          <h2 className="text-sm font-semibold">
            {heading}{' '}
            <span className="tnum font-normal" style={{ color: 'var(--color-muted)' }}>
              ({dayEntries.length})
            </span>
          </h2>
          <span className="tnum text-sm">
            <Money>{formatLedgerSpend(dayTotal)}</Money>
          </span>
        </div>
        {dayEntries.length === 0 && dayBills.length === 0 ? (
          <p
            className="panel px-4 py-6 text-center text-sm"
            style={{ color: 'var(--color-muted)' }}
          >
            Nothing on this day
          </p>
        ) : (
          <ul className="panel flex flex-col divide-y overflow-hidden">
            {dayEntries.map((entry) => (
              <SwipeRow
                key={entry.id}
                entry={entry}
                emoji={emojiFor(emojiMap, entry.category)}
                iconSet={iconSet}
                hue={hueFor(hueMap, entry.category)}
              />
            ))}
            {dayBills.map((bill) => (
              <li key={`bill-${bill.id}`}>
                <Link
                  href={`/recurring/edit?id=${bill.id}`}
                  className="tap flex items-center gap-3 px-4 py-2"
                  style={{ color: 'var(--color-muted)' }}
                >
                  <CategoryIcon
                    emoji={emojiFor(emojiMap, bill.category ?? '')}
                    name={bill.category ?? bill.name}
                    iconSet={iconSet}
                    hue={hueFor(hueMap, bill.category ?? '')}
                    size="sm"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{bill.name}</span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <DayMark kind="upcoming" />
                      Bill due
                    </span>
                  </span>
                  <span className="tnum text-sm">
                    <Money>
                      {bill.currency === 'THB'
                        ? formatLedgerSpend(-bill.amount)
                        : formatForeign(bill.amount, bill.currency)}
                    </Money>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Run the component test to verify it passes**

Run: `npm test -- src/features/entries/ui/RecordsCalendar.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing page tests**

Append to `src/app/records/page.test.tsx`:

```tsx
describe('/records calendar view', () => {
  it('renders the calendar and the selected day in place of the day sections', () => {
    vi.mocked(useRecords).mockReturnValue({
      ready: true,
      data: {
        ...data(),
        groupBy: 'calendar',
        calendar: {
          cells: [{ date: SPEND.date, total: 1200, intensity: 4 }],
          marks: new Map(),
          selectedDay: SPEND.date,
          dayEntries: [SPEND],
          dayTotal: SPEND.amount,
          dayBills: [],
        },
      },
    });
    renderPage();
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Thu 2 Jul: ฿1,200/ })).toHaveAttribute(
      'aria-current',
      'date',
    );
    expect(screen.getByText('Lunch')).toBeInTheDocument();
    // The day sections are replaced, so the other day's refund row is not on screen.
    expect(screen.queryByText('Dinner split repaid')).toBeNull();
  });

  it('offers no Calendar tab in search mode', () => {
    vi.mocked(useRecords).mockReturnValue({
      ready: true,
      data: { ...data(), searching: true, spanAll: true, query: 'lunch' },
    });
    renderPage();
    expect(screen.queryByRole('link', { name: 'Calendar' })).toBeNull();
  });
});
```

- [ ] **Step 6: Run the page test to verify the new tests fail**

Run: `npm test -- src/app/records/page.test.tsx`
Expected: the two new tests FAIL (no "Calendar" link; the refund row is still rendered). The existing tests pass.

- [ ] **Step 7: Wire the page**

In `src/app/records/page.tsx`:

Add the import after the `EmptyLedger` import:

```tsx
import { RecordsCalendar as RecordsCalendarView } from '@features/entries/ui/RecordsCalendar';
```

After `const page = params.get('page') ?? undefined;` add:

```tsx
  const day = params.get('day') ?? undefined;
```

Pass it to the hook: in the `useRecords({...})` call add `day,` after `page,`.

Add `calendar,` to the `data` destructure after `pageCount,`.

After the `viewHref` function add:

```tsx
  // A calendar day link keeps the cycle, the view and both chip filters; only ?day= moves.
  const dayHref = (d: string) => {
    const p = new URLSearchParams();
    p.set('cycle', activeKey);
    p.set('view', 'calendar');
    if (category) p.set('category', category);
    if (account) p.set('account', account);
    p.set('day', d);
    return `/records?${p.toString()}`;
  };
```

Change the main branch condition `{sections.length > 0 ? (` to:

```tsx
      {calendar !== null || sections.length > 0 ? (
```

In the tab strip, after the `By account` `ViewLink`, add:

```tsx
              {/* The calendar is a cycle view, so search/trip/all-category don't offer it. */}
              {!spanAll ? (
                <ViewLink
                  label="Calendar"
                  active={groupBy === 'calendar'}
                  href={viewHref('calendar')}
                />
              ) : null}
```

Change `{sections.length > 1 ? <CollapseAllButton /> : null}` to:

```tsx
              {calendar === null && sections.length > 1 ? <CollapseAllButton /> : null}
```

Replace `{sections.map((section) => (` … its closing `))}` (the whole `<details>` block) by wrapping it:

```tsx
          {calendar !== null ? (
            <RecordsCalendarView
              calendar={calendar}
              hrefFor={dayHref}
              emojiMap={emojiMap}
              hueMap={hueMap}
              iconSet={iconSet}
            />
          ) : (
            sections.map((section) => (
              // …the existing <details> block, unchanged…
            ))
          )}
```

(Move the existing `<details open key={section.key} …>…</details>` JSX, unchanged, into that
`sections.map` callback. Keep its leading comment inside the callback.)

- [ ] **Step 8: Run the Records tests to verify they pass**

Run: `npm test -- src/app/records/page.test.tsx src/features/entries/ui/RecordsCalendar.test.tsx`
Expected: PASS.

- [ ] **Step 9: Gates and commit**

```bash
npm run format:files src/features/entries/ui/RecordsCalendar.tsx src/features/entries/ui/RecordsCalendar.test.tsx src/app/records/page.tsx src/app/records/page.test.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/RecordsCalendar.tsx src/features/entries/ui/RecordsCalendar.test.tsx src/app/records/page.tsx src/app/records/page.test.tsx
git commit -m "feat(app): add a Calendar view to Records" -m "Tap a day to see its entries under the grid, with the same swipe rows as the other views and the day's upcoming bills after them. The selected day rides on ?day= so Edit and back return to it."
```

---

### Task 6: Docs and browser verification

**Files:**
- Modify: `PRODUCT.md:36-37`

**Interfaces:**
- Consumes: everything above.
- Produces: the product description, plus a browser-verified feature.

- [ ] **Step 1: Describe the view in `PRODUCT.md`**

Replace:

```md
- **Records** — the cycle's expenses grouped by day, each a swipe-to-edit/delete row, with live
  cross-cycle search.
```

with:

```md
- **Records** — the cycle's expenses grouped by day, each a swipe-to-edit/delete row, with live
  cross-cycle search. A **Calendar** view lays the cycle out as a month grid (darker = more
  discretionary spend, with marks for a posted bill, a bill still due, and off-budget spend); tap a
  day to list its entries and upcoming bills beneath it.
```

- [ ] **Step 2: Start the dev server**

Run (in the background): `npm run dev:web`
Wait until it reports ready on `http://127.0.0.1:4010`.

- [ ] **Step 3: Verify in a real browser at 412px, both themes**

With Playwright MCP (resize to 412×915). Close any other tab on the origin first, because OPFS allows one holder at a time.

1. Open `http://127.0.0.1:4010/records`. The tab strip shows four tabs on ONE line with no wrapping or clipped labels. Screenshot.
2. Tap **Calendar**. The grid shows the current cycle, today is outlined, and the legend lists only the kinds present. Day numbers are readable on the darkest cells. Screenshot.
3. Tap a day with entries. The URL gains `&day=`, the outline moves, the list shows that day, and the page does not scroll to top.
4. Press browser Back once. It leaves the calendar rather than stepping back through tapped days (the links use `replace`).
5. Tap a row → Edit screen → Back. You return to the same `?day=`.
6. If a recurring rule is due later this cycle, its day shows the ring mark and tapping that day lists a muted "Bill due" row linking to `/recurring/edit?id=`. If no rule exists, note that it was not exercised; do NOT create one on the real ledger.
7. Step to the previous cycle with the ‹ stepper. `?day=` is dropped, the calendar opens on that cycle's last day, and there are no ring marks.
8. Switch theme (Settings → theme) to the other mode and repeat step 2's legibility check. Screenshot.
9. Open `/analytics`. The Daily spending card has no links, and bill days are no longer the darkest.
10. Swipe-delete + Undo ONLY on a ฿1 entry you add yourself for this check, on today. The cell and list update after delete and again after Undo. Then delete that ฿1 row for real.

Record each step's observed result. Any failure is a defect: fix it in the task's file with a regression test, then re-run the gates.

- [ ] **Step 4: Gates and commit**

```bash
npm run format:files PRODUCT.md
npm run typecheck && npm run lint && npm run format:check && npm test
git add PRODUCT.md
git commit -m "docs(product): describe the Records calendar view" -m "Records gained a Calendar view; the product overview is where a reader learns what each tab is for."
```

- [ ] **Step 5: Stop the dev server** (TaskStop on the background task).
