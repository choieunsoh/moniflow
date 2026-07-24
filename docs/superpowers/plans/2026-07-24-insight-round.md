# Insight Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four read-side insight features — upcoming bills (dashboard), and top-notes + spend heatmap + anomaly flag (analytics) — each a pure function plus a thin render, with no schema, CSV, or backup change.

**Architecture:** Every feature is a new pure function tested in isolation, wired into an existing read hook (`use-dashboard` for I, `use-analytics` for G/F/H), and rendered by a thin component. Feature I subtracts known upcoming recurring bills from safe-to-spend; G/F/H all ride the anchor-cycle data `use-analytics` already loads (the per-category-per-cycle `matrix` and the cycle's entries), so they add at most one query.

**Tech Stack:** TypeScript 5.9 strict (ESM), Next.js 16 App Router (`output: 'export'`, all `'use client'`), React 19, Tailwind v4, Vitest + `@testing-library/react` (`renderHook`), Drizzle query builder over the sqlite-proxy `Db`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-24-insight-round-design.md`.
- **No new column, no `BOOTSTRAP_SQL` edit, no `schema.ts` change, no Monefy-CSV change.** These features persist nothing new. If a task seems to need a column, stop — it's out of scope.
- **Ledger is outflow-only:** stored `amount` is negative; every magnitude shown is `Math.abs`. Never relax the `amount < 0` filter in any query.
- **TS bans (errors in lint):** no `any`, no `as`, no `!`, no `// @ts-*`; `type` over `interface`; `for..of` over `forEach`; `satisfies`/`as const` where a contract or literal is wanted.
- **Money formatting:** `formatBahtWhole` for computed glance figures, `formatBaht` for echoing stored amounts. THB. `tnum` class for aligned digits.
- **Dates:** date keys are `YYYY-MM-DD`; parse with `.split('-').map(Number)` (repo convention) and format via `Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })`. No manual zero-padding for user-facing dates.
- **Quality gates before every commit, each run separately:** `npm run format:files <changed files>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. All must pass.
- **Reads are async, post-mount.** Hooks return `{ ready, data }`. Don't introduce a synchronous read.
- **412px browser check** before a feature is called done (tests never exercise the worker/layout).

---

## Task 1: `postsBetween` — a rule's not-yet-posted future within a window

**Files:**
- Modify: `src/features/recurring/schedule.ts` (add export after `duePosts`, ~line 117)
- Test: `src/features/recurring/schedule.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: existing `Rule`, `Due`, `maxPosts(rule)`, `paidCount(rule)`, `dueDateAt(rule, i)` from this file.
- Produces: `postsBetween(rule: Rule, afterIso: string, throughIso: string): Due[]` — occurrences due strictly after `afterIso`, up to and including `throughIso`, respecting the cap and skipping already-posted ones.

- [ ] **Step 1: Write the failing test**

Add to `src/features/recurring/schedule.test.ts`:

```ts
import { postsBetween } from './schedule';
import type { Rule } from './schedule';

describe('postsBetween', () => {
  const monthly: Rule = {
    day: 15,
    intervalMonths: 1,
    startDate: '2026-01-15',
    startSeq: 1,
    totalCount: null,
    lastPosted: '2026-07-15',
  };

  it('returns occurrences strictly after `after`, through `through` inclusive', () => {
    // window is the rest of a cycle: after today (2026-07-20), through cycle end (2026-08-24)
    expect(postsBetween(monthly, '2026-07-20', '2026-08-24')).toEqual([
      { date: '2026-08-15', seq: 8 },
    ]);
  });

  it('excludes an occurrence falling on `after` itself', () => {
    expect(postsBetween(monthly, '2026-08-15', '2026-09-30')).toEqual([
      { date: '2026-09-15', seq: 9 },
    ]);
  });

  it('is empty when nothing is due before `through`', () => {
    expect(postsBetween(monthly, '2026-07-20', '2026-08-10')).toEqual([]);
  });

  it('respects an installment cap — no posts past the final one', () => {
    const installment: Rule = {
      day: 1,
      intervalMonths: 1,
      startDate: '2026-06-01',
      startSeq: 1,
      totalCount: 3, // final due date 2026-08-01
      lastPosted: '2026-07-01',
    };
    expect(postsBetween(installment, '2026-07-20', '2026-12-31')).toEqual([
      { date: '2026-08-01', seq: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/schedule.test.ts`
Expected: FAIL — `postsBetween is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `src/features/recurring/schedule.ts`, after `duePosts` (~line 117):

```ts
// Occurrences due strictly after `afterIso`, up to and including `throughIso` — a rule's not-yet-
// posted future inside a window. Mirrors duePosts' cap/pointer handling; used to total a cycle's
// upcoming bills WITHOUT posting them. Starts from paidCount so an old subscription doesn't spin
// through years of posted history to reach the window.
export function postsBetween(rule: Rule, afterIso: string, throughIso: string): Due[] {
  const cap = maxPosts(rule);
  const out: Due[] = [];
  for (let i = paidCount(rule); cap === null || i < cap; i++) {
    const date = dueDateAt(rule, i);
    if (date > throughIso) break;
    if (date <= afterIso) continue;
    out.push({ date, seq: rule.startSeq + i });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/recurring/schedule.test.ts`
Expected: PASS (all existing tests in the file still green).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/recurring/schedule.ts src/features/recurring/schedule.test.ts
npm run typecheck && npm run lint && npm test -- src/features/recurring/schedule.test.ts
git add src/features/recurring/schedule.ts src/features/recurring/schedule.test.ts
git commit -m "feat(recurring): add postsBetween — a rule's not-yet-posted future in a window" -m "The bounded sibling of duePosts: occurrences in (afterIso, throughIso], cap- and pointer-respecting. Basis for totalling a cycle's upcoming bills without posting them." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `committedThisCycle` — total the cycle's upcoming bills

**Files:**
- Create: `src/features/recurring/upcoming.ts`
- Test: `src/features/recurring/upcoming.test.ts`

**Interfaces:**
- Consumes: `postsBetween` (Task 1). Rules carry a positive `amount` and nullable `rate` (see `Recurrence` in `schema.ts`).
- Produces:
  - `type Committed = { total: number; count: number }`
  - `committedThisCycle(rules: CommittedRule[], todayIso: string, cycleEndIso: string): Committed`
  - `type CommittedRule = Rule & { amount: number; rate: number | null }` — `Recurrence` is assignable to it.

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/upcoming.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { committedThisCycle, type CommittedRule } from './upcoming';

const base: Omit<CommittedRule, 'amount' | 'rate'> = {
  day: 15,
  intervalMonths: 1,
  startDate: '2026-01-15',
  startSeq: 1,
  totalCount: null,
  lastPosted: '2026-07-15',
};

describe('committedThisCycle', () => {
  it('sums amounts over each rule’s occurrences in (today, cycleEnd]', () => {
    const rules: CommittedRule[] = [
      { ...base, amount: 400, rate: null }, // one occurrence 2026-08-15
      { ...base, day: 1, startDate: '2026-01-01', lastPosted: '2026-08-01', amount: 1200, rate: null }, // next is 2026-09-01, outside window
    ];
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-24')).toEqual({ total: 400, count: 1 });
  });

  it('converts a pinned-rate FX rule at its rate', () => {
    const rules: CommittedRule[] = [{ ...base, amount: 10, rate: 36 }]; // 10 USD @ 36 = 360 THB
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-24')).toEqual({ total: 360, count: 1 });
  });

  it('is zero when no rule has an occurrence in the window', () => {
    const rules: CommittedRule[] = [{ ...base, amount: 400, rate: null }];
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-10')).toEqual({ total: 0, count: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/upcoming.test.ts`
Expected: FAIL — cannot find module `./upcoming`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/recurring/upcoming.ts`:

```ts
import { postsBetween, type Rule } from './schedule';

// A rule as this module needs it: the schedule subset plus its money fields. `Recurrence` (schema.ts)
// is structurally assignable, so a DB row passes with no mapping.
export type CommittedRule = Rule & { amount: number; rate: number | null };

export type Committed = { total: number; count: number };

// Total (in THB) and count of every recurring bill that will post after `todayIso`, through
// `cycleEndIso` inclusive. Feeds the dashboard's safe-to-spend so known future bills are reserved.
//
// ponytail: a live-FX rule (foreign currency, rate null) is estimated at its face amount — we can't
// convert without the network, and a pure fn must not fetch. Pinned-rate rules convert exactly
// (amount × rate). THB rules have rate null → × 1. Upgrade path if foreign recurring bills ever
// matter: thread recurring/rates.ts convertAmount through an async variant at the hook boundary.
export function committedThisCycle(
  rules: CommittedRule[],
  todayIso: string,
  cycleEndIso: string,
): Committed {
  let total = 0;
  let count = 0;
  for (const rule of rules) {
    const posts = postsBetween(rule, todayIso, cycleEndIso);
    count += posts.length;
    total += posts.length * rule.amount * (rule.rate ?? 1);
  }
  return { total, count };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/recurring/upcoming.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/recurring/upcoming.ts src/features/recurring/upcoming.test.ts
npm run typecheck && npm run lint && npm test -- src/features/recurring/upcoming.test.ts
git add src/features/recurring/upcoming.ts src/features/recurring/upcoming.test.ts
git commit -m "feat(recurring): total a cycle's upcoming bills (committedThisCycle)" -m "Sums each active rule's postsBetween(today, cycleEnd) occurrences × amount, converting pinned-rate FX rules. Pure; live-FX rules estimate at face value (documented ceiling)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `safeToSpendPerDay` reserves committed bills

**Files:**
- Modify: `src/features/entries/dashboard.ts:12-21`
- Test: `src/features/entries/dashboard.test.ts:10-27`

**Interfaces:**
- Produces (changed signature): `safeToSpendPerDay(totalBudget: number | null, spent: number, committed: number, daysLeft: number): number | null` — remaining budget is now `totalBudget − spent − committed`.

- [ ] **Step 1: Update the tests to the new signature (they now fail)**

Replace the `safeToSpendPerDay` block in `src/features/entries/dashboard.test.ts` (lines 10-27) with:

```ts
describe('safeToSpendPerDay', () => {
  it('spreads budget minus spent minus committed over the days left', () => {
    // 3000 budget − 180 spent − 400 committed = 2420 remaining, over 29 days
    expect(safeToSpendPerDay(3000, 180, 400, 29)).toBeCloseTo(2420 / 29);
  });

  it('committed 0 leaves the old behaviour intact', () => {
    expect(safeToSpendPerDay(3000, 180, 0, 29)).toBeCloseTo(2820 / 29);
  });

  it('returns null when no total budget is set (caller shows the average instead)', () => {
    expect(safeToSpendPerDay(null, 180, 400, 29)).toBeNull();
  });

  it('floors at 0 when spent plus committed exceeds the budget', () => {
    expect(safeToSpendPerDay(100, 60, 60, 10)).toBe(0);
  });

  it('never divides by zero on the last day', () => {
    expect(safeToSpendPerDay(300, 100, 0, 0)).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/dashboard.test.ts`
Expected: FAIL — arity/type mismatch on `safeToSpendPerDay`.

- [ ] **Step 3: Update the implementation**

Replace `safeToSpendPerDay` in `src/features/entries/dashboard.ts` (lines 9-21) with:

```ts
// Remaining budget spread over the days left in the cycle (today inclusive). Remaining now nets out
// `committed` — recurring bills known to post before cycle end (see recurring/committedThisCycle) —
// so the figure reserves them instead of letting you "safely" spend money that's already promised.
// null when no total budget is set — the caller shows the actual average instead. Floors at 0.
export function safeToSpendPerDay(
  totalBudget: number | null,
  spent: number,
  committed: number,
  daysLeft: number,
): number | null {
  if (totalBudget === null) return null;
  const remaining = totalBudget - spent - committed;
  if (remaining <= 0) return 0;
  return remaining / Math.max(1, daysLeft);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/dashboard.test.ts`
Expected: PASS. (`use-dashboard.ts` still calls the 3-arg form and will fail typecheck — that's fixed in Task 4. Do NOT run full `typecheck` at this task's commit; scope it.)

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/dashboard.ts src/features/entries/dashboard.test.ts
npm test -- src/features/entries/dashboard.test.ts
git add src/features/entries/dashboard.ts src/features/entries/dashboard.test.ts
git commit -m "feat(entries): safe-to-spend reserves committed recurring bills" -m "safeToSpendPerDay gains a committed param; remaining = budget - spent - committed. use-dashboard wiring lands next task." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Wire upcoming bills into the dashboard

**Files:**
- Modify: `src/features/entries/use-dashboard.ts`
- Modify: `src/features/entries/ui/DashboardCards.tsx:12-30, 45-89`
- Test: `src/features/entries/use-dashboard.test.ts` (extend existing)

**Interfaces:**
- Consumes: `listRules` (`recurring/queries.ts`), `committedThisCycle` + `Committed` (Task 2), `safeToSpendPerDay` (Task 3).
- Produces: `DashboardData` gains `upcoming: Committed`; `safePerDay` now reflects committed bills.

- [ ] **Step 1: Extend the hook**

In `src/features/entries/use-dashboard.ts`:

Add imports:
```ts
import { listRules } from '@features/recurring/queries';
import { committedThisCycle, type Committed } from '@features/recurring/upcoming';
```

Add to the `DashboardData` type (after `projected`):
```ts
  upcoming: Committed;
```

Add `listRules(db)` to the second `Promise.all` (the one loading `summary`, `prevSummary`, …):
```ts
      const [summary, prevSummary, entriesInCycle, budgetRows, rules] = await Promise.all([
        getCycleSummary(db, cycle.start, cycle.end),
        getCycleSummary(db, prev.start, prev.end),
        getEntriesInRange(db, cycle.start, cycle.end),
        getBudgets(db),
        listRules(db),
      ]);
```

Compute committed after `daysLeft` is known, and pass it to `safeToSpendPerDay`:
```ts
      const upcoming = committedThisCycle(rules, todayIso(), cycle.end);
```
Change the `safePerDay` line in `setData`:
```ts
        safePerDay: safeToSpendPerDay(totalBudget, total, upcoming.total, daysLeft),
```
Add `upcoming,` to the `setData` object.

- [ ] **Step 2: Extend the hook test**

In `src/features/entries/use-dashboard.test.ts`, add an assertion that `data.upcoming` is present and that a rule due within the cycle lowers `safePerDay`. Follow the file's existing seeding pattern (seed a budget + an active recurrence, render the hook, await `ready`). Minimal assertion:

```ts
// after seeding a total budget and one active monthly rule due before cycle end:
expect(result.current.data?.upcoming.count).toBe(1);
expect(result.current.data?.upcoming.total).toBeGreaterThan(0);
```

(Read the existing tests in this file first and mirror their `addRule`/`setBudget` seeding helpers; do not invent new ones.)

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `npm test -- src/features/entries/use-dashboard.test.ts`
Expected: FAIL first (no `upcoming`), PASS after Step 1.

- [ ] **Step 4: Render the upcoming line**

In `src/features/entries/ui/DashboardCards.tsx`:

Pass `upcoming` into `SafeToSpendCard` — change the call in `DashboardCards`:
```tsx
      <SafeToSpendCard
        safePerDay={data.safePerDay}
        avgPerDay={data.avgPerDay}
        daysLeft={data.daysLeft}
        upcoming={data.upcoming}
      />
```

Add the prop and a sub-line to `SafeToSpendCard`. Update its signature and render an upcoming line whenever `upcoming.count > 0` (independent of whether a budget exists). Add `upcoming: DashboardData['upcoming']` to the destructured props and type, then render — in EACH of the three return branches, before `</CardShell>` — this line:
```tsx
        {upcoming.count > 0 ? (
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Upcoming: {formatBahtWhole(upcoming.total)} · {upcoming.count}{' '}
            {upcoming.count === 1 ? 'bill' : 'bills'} due
          </span>
        ) : null}
```
Import `DashboardData` is already imported at the top of the file.

- [ ] **Step 5: Verify gates + 412px browser**

Run: `npm run typecheck && npm run lint && npm test`
Then: `npm run dev:web`, open `127.0.0.1:4010/dashboard` at 412px with a total budget set and at least one active recurring rule due before cycle end. Confirm the "Upcoming: ฿X · N bills due" line shows and safe-to-spend dropped accordingly.

- [ ] **Step 6: Commit**

```bash
npm run format:files src/features/entries/use-dashboard.ts src/features/entries/ui/DashboardCards.tsx src/features/entries/use-dashboard.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/use-dashboard.ts src/features/entries/ui/DashboardCards.tsx src/features/entries/use-dashboard.test.ts
git commit -m "feat(entries): show upcoming bills on the dashboard and reserve them from safe-to-spend" -m "use-dashboard loads active rules, totals this cycle's committed bills, and nets them out of safe-to-spend; SafeToSpendCard shows 'Upcoming: X, N bills due'. Projection stays pace-based, untouched." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `topNotes` — rank a cycle's spend by note text

**Files:**
- Create: `src/features/entries/by-note.ts`
- Test: `src/features/entries/by-note.test.ts`

**Interfaces:**
- Consumes: `EntryRow` from `./schema`.
- Produces:
  - `type NoteRow = { note: string; total: number; count: number }`
  - `topNotes(entries: EntryRow[]): NoteRow[]` — magnitude totals, desc, blank/null notes bucketed as `'No note'`.

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/by-note.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { topNotes } from './by-note';
import type { EntryRow } from './schema';

function row(note: string | null, amount: number): EntryRow {
  return {
    id: 1, date: '2026-07-10', time: null, accountId: 1, categoryId: 1,
    amount, currency: null, originalAmount: null, note, source: 'manual',
    category: 'Food', account: 'Cash',
  };
}

describe('topNotes', () => {
  it('sums magnitudes per note, biggest first', () => {
    expect(topNotes([row('Starbucks', -120), row('7-11', -60), row('Starbucks', -80)])).toEqual([
      { note: 'Starbucks', total: 200, count: 2 },
      { note: '7-11', total: 60, count: 1 },
    ]);
  });

  it('buckets blank and null notes as "No note"', () => {
    expect(topNotes([row(null, -50), row('', -30), row('   ', -20)])).toEqual([
      { note: 'No note', total: 100, count: 3 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/by-note.test.ts`
Expected: FAIL — cannot find module `./by-note`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/entries/by-note.ts`:

```ts
import type { EntryRow } from './schema';

export type NoteRow = { note: string; total: number; count: number };

const NO_NOTE = 'No note';

// Rank a set of entries by note text — "where did it actually go" at merchant granularity, from the
// note column the ledger already stores. Magnitudes (the ledger stores outflows negative), biggest
// first. Blank/whitespace/null notes collapse into one 'No note' bucket rather than littering the
// list with untitled rows.
export function topNotes(entries: EntryRow[]): NoteRow[] {
  const byNote = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const key = e.note !== null && e.note.trim() !== '' ? e.note : NO_NOTE;
    const seen = byNote.get(key) ?? { total: 0, count: 0 };
    byNote.set(key, { total: seen.total + Math.abs(e.amount), count: seen.count + 1 });
  }
  return [...byNote.entries()]
    .map(([note, v]) => ({ note, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/by-note.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/by-note.ts src/features/entries/by-note.test.ts
npm run typecheck && npm run lint && npm test -- src/features/entries/by-note.test.ts
git add src/features/entries/by-note.ts src/features/entries/by-note.test.ts
git commit -m "feat(entries): rank spend by note text (topNotes)" -m "Merchant-level 'where did it go' from the existing note column; magnitudes desc, blank notes bucketed." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `toHeatmapCells` — one intensity cell per day of a cycle

**Files:**
- Create: `src/features/entries/heatmap.ts`
- Test: `src/features/entries/heatmap.test.ts`

**Interfaces:**
- Consumes: `DayGroup` from `./by-date`, `Cycle` from `./cycle` (has `start` and `end`, `YYYY-MM-DD`).
- Produces:
  - `type HeatmapCell = { date: string; total: number; intensity: number }` (`intensity` 0–4)
  - `toHeatmapCells(dayGroups: DayGroup[], cycle: Cycle): HeatmapCell[]` — every day in `[cycle.start, cycle.end]`, empty days included as real zeros.

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/heatmap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toHeatmapCells } from './heatmap';
import type { DayGroup } from './by-date';
import type { Cycle } from './cycle';

const cycle = { key: '2026-07', start: '2026-07-01', end: '2026-07-05' } as Cycle;

function group(date: string, total: number): DayGroup {
  return { date, total, entries: [] };
}

describe('toHeatmapCells', () => {
  it('emits one cell per day in the cycle, empty days as zero', () => {
    const cells = toHeatmapCells([group('2026-07-02', -100)], cycle);
    expect(cells.map((c) => c.date)).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
    ]);
    expect(cells[0]).toEqual({ date: '2026-07-01', total: 0, intensity: 0 });
  });

  it('buckets intensity 1..4 against the cycle’s busiest day, 0 for empty', () => {
    const cells = toHeatmapCells(
      [group('2026-07-01', -100), group('2026-07-02', -25), group('2026-07-03', -50)],
      cycle,
    );
    const byDate = new Map(cells.map((c) => [c.date, c.intensity]));
    expect(byDate.get('2026-07-01')).toBe(4); // busiest
    expect(byDate.get('2026-07-02')).toBe(1); // 25% of max
    expect(byDate.get('2026-07-03')).toBe(2); // 50% of max
    expect(byDate.get('2026-07-04')).toBe(0); // empty
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/heatmap.test.ts`
Expected: FAIL — cannot find module `./heatmap`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/entries/heatmap.ts`:

```ts
import type { DayGroup } from './by-date';
import type { Cycle } from './cycle';

export type HeatmapCell = { date: string; total: number; intensity: number };

const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

// Every YYYY-MM-DD from start through end inclusive. UTC arithmetic — the date keys are UTC (see the
// project's date policy), so stepping a UTC day count never trips DST.
function eachDay(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const out: string[] = [];
  for (
    let t = Date.UTC(sy, sm - 1, sd);
    t <= Date.UTC(ey, em - 1, ed);
    t += 24 * 60 * 60 * 1000
  ) {
    out.push(dateKey.format(new Date(t)));
  }
  return out;
}

// One cell per day of the cycle — a calendar-grid glance at where a cycle's spending landed. Days
// with no entries are real zeros (kept, not skipped: a gap in the grid would read as a bug).
// `intensity` buckets 1..4 against the cycle's busiest day (0 for an empty day), so the render maps
// it to a background token without knowing any baht figure.
export function toHeatmapCells(dayGroups: DayGroup[], cycle: Cycle): HeatmapCell[] {
  const totalByDate = new Map(dayGroups.map((g) => [g.date, Math.abs(g.total)]));
  const dates = eachDay(cycle.start, cycle.end);
  const max = Math.max(0, ...dates.map((d) => totalByDate.get(d) ?? 0));
  return dates.map((date) => {
    const total = totalByDate.get(date) ?? 0;
    const intensity = max === 0 || total === 0 ? 0 : Math.min(4, Math.ceil((total / max) * 4));
    return { date, total, intensity };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/heatmap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/heatmap.ts src/features/entries/heatmap.test.ts
npm run typecheck && npm run lint && npm test -- src/features/entries/heatmap.test.ts
git add src/features/entries/heatmap.ts src/features/entries/heatmap.test.ts
git commit -m "feat(entries): per-day spend intensity cells for a cycle (toHeatmapCells)" -m "One cell per cycle day, empty days as real zeros, intensity bucketed 1..4 against the busiest day. Pure; render maps intensity to a background token." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `anomalies` — categories spending above their own norm

**Files:**
- Create: `src/features/entries/anomaly.ts`
- Test: `src/features/entries/anomaly.test.ts`

**Interfaces:**
- Consumes: the per-cycle-per-category matrix `use-analytics` already builds: `Map<cycleKey, Map<category, { total: number; count: number }>>` (magnitudes).
- Produces:
  - `type Anomaly = { category: string; current: number; avg: number; ratio: number }`
  - `anomalies(matrix, subjectKey, threshold = 1.5): Anomaly[]` — categories whose `subjectKey` spend is ≥ threshold × their average across the window's OTHER cycles that have spend (≥2 required), desc by ratio.

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/anomaly.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { anomalies } from './anomaly';

type Cell = { total: number; count: number };
function m(rows: Record<string, Record<string, number>>): Map<string, Map<string, Cell>> {
  return new Map(
    Object.entries(rows).map(([key, cats]) => [
      key,
      new Map(Object.entries(cats).map(([c, total]) => [c, { total, count: 1 } as Cell])),
    ]),
  );
}

describe('anomalies', () => {
  it('flags a category above threshold vs its own average across other cycles', () => {
    const matrix = m({
      '2026-04': { Food: 1000 },
      '2026-05': { Food: 1000 },
      '2026-06': { Food: 1000 },
      '2026-07': { Food: 2500 }, // 2.5x the 1000 average
    });
    expect(anomalies(matrix, '2026-07')).toEqual([
      { category: 'Food', current: 2500, avg: 1000, ratio: 2.5 },
    ]);
  });

  it('skips a category with fewer than two prior non-zero cycles', () => {
    const matrix = m({ '2026-06': { Rent: 5000 }, '2026-07': { Rent: 9000 } });
    expect(anomalies(matrix, '2026-07')).toEqual([]);
  });

  it('does not flag a category at or below threshold', () => {
    const matrix = m({
      '2026-05': { Food: 1000 }, '2026-06': { Food: 1000 }, '2026-07': { Food: 1400 },
    });
    expect(anomalies(matrix, '2026-07')).toEqual([]);
  });

  it('returns empty when the subject cycle is missing', () => {
    expect(anomalies(m({ '2026-06': { Food: 1000 } }), '2026-07')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/anomaly.test.ts`
Expected: FAIL — cannot find module `./anomaly`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/entries/anomaly.ts`:

```ts
export type Anomaly = { category: string; current: number; avg: number; ratio: number };

type Cell = { total: number; count: number };

// Categories whose spend in the subject cycle stands out against their OWN history. The basis for
// each category is that category's spend in the window's other cycles, excluding zeros — a zero in
// the analytics window means "not tracking yet / no spend", and averaging it in would fake a spike
// (the same exclusion trend.completeBars applies to the average line). Needs at least two such
// cycles or the category has no "normal" yet and is skipped. Sorted worst-ratio first so the caller
// can show only the top offenders.
export function anomalies(
  matrix: Map<string, Map<string, Cell>>,
  subjectKey: string,
  threshold = 1.5,
): Anomaly[] {
  const subject = matrix.get(subjectKey);
  if (subject === undefined) return [];
  const out: Anomaly[] = [];
  for (const [category, cell] of subject) {
    const current = cell.total;
    if (current <= 0) continue;
    const basis: number[] = [];
    for (const [key, byCategory] of matrix) {
      if (key === subjectKey) continue;
      const v = byCategory.get(category)?.total ?? 0;
      if (v > 0) basis.push(v);
    }
    if (basis.length < 2) continue;
    const avg = basis.reduce((sum, v) => sum + v, 0) / basis.length;
    const ratio = current / avg;
    if (ratio >= threshold) out.push({ category, current, avg, ratio });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/anomaly.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/anomaly.ts src/features/entries/anomaly.test.ts
npm run typecheck && npm run lint && npm test -- src/features/entries/anomaly.test.ts
git add src/features/entries/anomaly.ts src/features/entries/anomaly.test.ts
git commit -m "feat(entries): flag categories spending above their own norm (anomalies)" -m "Compares the subject cycle to each category's average across the window's other non-zero cycles (>=2 required, zeros excluded like completeBars). Pure; feeds an analytics banner." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Expose heatmap / top-notes / anomalies from `use-analytics`

**Files:**
- Modify: `src/features/entries/use-analytics.ts`
- Test: `src/features/entries/use-analytics.test.ts` (extend)

**Interfaces:**
- Consumes: `topNotes`/`NoteRow` (Task 5), `toHeatmapCells`/`HeatmapCell` (Task 6), `anomalies`/`Anomaly` (Task 7), existing `getEntriesInRange` (`queries.ts`), `groupByDate` (`by-date.ts`).
- Produces: `AnalyticsData` gains `topNotes: NoteRow[]`, `heatmapCells: HeatmapCell[]`, `anomalies: Anomaly[]` — all scoped to the anchor cycle (`activeKey`), whole-cycle (not category-filtered).

- [ ] **Step 1: Extend the hook**

In `src/features/entries/use-analytics.ts`:

Add imports:
```ts
import { getCategoryBreakdown, getEntriesInRange, type Breakdown } from './queries';
import { groupByDate } from './by-date';
import { topNotes, type NoteRow } from './by-note';
import { toHeatmapCells, type HeatmapCell } from './heatmap';
import { anomalies, type Anomaly } from './anomaly';
```
(The first line replaces the existing `import { getCategoryBreakdown, type Breakdown } from './queries';`.)

Add to `AnalyticsData` (after `budgetLine`):
```ts
  topNotes: NoteRow[];
  heatmapCells: HeatmapCell[];
  anomalies: Anomaly[];
```

The anchor cycle is the newest in the window. After `const cycles = lastCycles(activeKey, TREND_CYCLES, cutoff);` and after `breakdowns`/`matrix` are built, add:
```ts
      const active = cycles[cycles.length - 1];
      const cycleEntries = await getEntriesInRange(db, active.start, active.end);
      const notes = topNotes(cycleEntries);
      const heatmapCells = toHeatmapCells(groupByDate(cycleEntries), active);
      const flagged = anomalies(matrix, activeKey);
```

Add to the `setData` object:
```ts
        topNotes: notes,
        heatmapCells,
        anomalies: flagged,
```

- [ ] **Step 2: Extend the hook test**

In `src/features/entries/use-analytics.test.ts`, add an assertion (mirroring the file's existing seeding) that after seeding a cycle's entries, `data.heatmapCells` is non-empty and `data.topNotes` reflects the seeded notes. Read the existing tests first and reuse their seed helpers.

```ts
expect(result.current.data?.heatmapCells.length).toBeGreaterThan(0);
expect(result.current.data?.topNotes[0]?.note).toBeDefined();
```

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `npm test -- src/features/entries/use-analytics.test.ts`
Expected: FAIL first (missing fields), PASS after Step 1.

- [ ] **Step 4: Verify gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. (No visible UI change yet — components land in Tasks 9–11.)

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
git commit -m "feat(entries): expose top-notes, heatmap cells, and anomalies from use-analytics" -m "One extra anchor-cycle entries query feeds top-notes and the heatmap; anomalies reuse the matrix already built. All anchor-cycle scoped." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Anomaly banner on the analytics page

**Files:**
- Create: `src/features/entries/ui/AnomalyBanner.tsx`
- Test: `src/features/entries/ui/AnomalyBanner.test.tsx`
- Modify: `src/app/analytics/page.tsx` (destructure + render)

**Interfaces:**
- Consumes: `Anomaly[]` (Task 7), rendered from `data.anomalies` (Task 8).
- Produces: `AnomalyBanner({ anomalies }: { anomalies: Anomaly[] })` — renders `null` when empty, else the worst 1–2.

- [ ] **Step 1: Write the failing component test**

Create `src/features/entries/ui/AnomalyBanner.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnomalyBanner } from './AnomalyBanner';

describe('AnomalyBanner', () => {
  it('renders nothing when there are no anomalies', () => {
    const { container } = render(<AnomalyBanner anomalies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the worst offenders with their ratio', () => {
    render(
      <AnomalyBanner
        anomalies={[
          { category: 'Food', current: 2500, avg: 1000, ratio: 2.5 },
          { category: 'Fun', current: 900, avg: 500, ratio: 1.8 },
        ]}
      />,
    );
    expect(screen.getByText(/Food/)).toBeInTheDocument();
    expect(screen.getByText(/2\.5×/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/ui/AnomalyBanner.test.tsx`
Expected: FAIL — cannot find module `./AnomalyBanner`.

- [ ] **Step 3: Write the component**

Create `src/features/entries/ui/AnomalyBanner.tsx`:

```tsx
import type { Anomaly } from '../anomaly';

const MAX_SHOWN = 2;
const ratioFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

// "This category is unusually high for you" — the worst one or two categories whose anchor-cycle
// spend stands out against their own norm (see anomalies()). Renders nothing when there's nothing to
// warn about, so it never occupies space on a normal cycle. Text carries the signal (category + '×
// your usual'); the warn colour is decoration, not the only cue.
export function AnomalyBanner({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <section
      className="panel flex flex-col gap-1.5 p-4"
      style={{ borderColor: 'var(--color-loss)' }}
      aria-label="Spending above your usual"
    >
      {anomalies.slice(0, MAX_SHOWN).map((a) => (
        <span key={a.category} className="text-sm">
          <span aria-hidden="true">⚠️ </span>
          <span className="font-semibold">{a.category}</span>{' '}
          <span className="tnum" style={{ color: 'var(--color-loss)' }}>
            {ratioFmt.format(a.ratio)}×
          </span>{' '}
          <span style={{ color: 'var(--color-muted)' }}>your usual</span>
        </span>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/ui/AnomalyBanner.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render it on the analytics page**

In `src/app/analytics/page.tsx`:
- Add import: `import { AnomalyBanner } from '@features/entries/ui/AnomalyBanner';`
- Add `anomalies` to the destructure at line 41.
- Immediately after `<h1 className="sr-only">Analytics</h1>` (line 72), before the main `<section className="panel …">`, add:
```tsx
      <AnomalyBanner anomalies={anomalies} />
```
Wrap the two elements in a `<div className="flex flex-col gap-4">` if the `PageContainer` doesn't already gap its children — check the existing spacing at 412px and match it.

- [ ] **Step 6: Verify gates + 412px browser**

Run: `npm run typecheck && npm run lint && npm test`
Then at 412px on `/analytics`: seed a category that spikes ≥1.5× its 2+-cycle average and confirm the banner shows; confirm it's absent on a normal cycle.

- [ ] **Step 7: Commit**

```bash
npm run format:files src/features/entries/ui/AnomalyBanner.tsx src/features/entries/ui/AnomalyBanner.test.tsx src/app/analytics/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/AnomalyBanner.tsx src/features/entries/ui/AnomalyBanner.test.tsx src/app/analytics/page.tsx
git commit -m "feat(app): anomaly banner on analytics — categories above their own norm" -m "Shows the worst 1-2 flagged categories with their ratio, or nothing on a normal cycle. Colour is decoration; the text carries the signal." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Spend heatmap section on the analytics page

**Files:**
- Create: `src/features/entries/ui/SpendHeatmap.tsx`
- Test: `src/features/entries/ui/SpendHeatmap.test.tsx`
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `HeatmapCell[]` (Task 6) from `data.heatmapCells`; `formatDayHeading`/`formatBahtWhole` for the a11y label.
- Produces: `SpendHeatmap({ cells }: { cells: HeatmapCell[] })` — a 7-column CSS grid; each populated day links to that day's records.

- [ ] **Step 1: Write the failing component test**

Create `src/features/entries/ui/SpendHeatmap.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpendHeatmap } from './SpendHeatmap';

describe('SpendHeatmap', () => {
  it('renders one cell per day and links populated days to records', () => {
    render(
      <SpendHeatmap
        cells={[
          { date: '2026-07-01', total: 0, intensity: 0 },
          { date: '2026-07-02', total: 100, intensity: 4 },
        ]}
      />,
    );
    // the busy day is a link to its records; the empty day is not
    const link = screen.getByRole('link', { name: /Jul 2/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('2026-07-02'));
    expect(screen.queryByRole('link', { name: /Jul 1/ })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/ui/SpendHeatmap.test.tsx`
Expected: FAIL — cannot find module `./SpendHeatmap`.

- [ ] **Step 3: Write the component**

Create `src/features/entries/ui/SpendHeatmap.tsx`. Confirm the records route's day-filter param first — `grep -rn "searchParams\|params.get" src/app/records src/features/entries/use-records.ts` — and use whatever it reads (this plan assumes `?date=`; if Records has no day filter, link to `/records?cycle=<key>` and land on the cycle instead, noting it in the commit):

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HeatmapCell } from '../heatmap';
import { formatBahtWhole } from '@shared/money';
import { formatDayHeading } from '@shared/date';

// intensity 0..4 → a background token. 0 is the bare surface (an empty day); 1..4 step up the accent.
// Kept as explicit classes so Tailwind sees the literals (no dynamic class-name concatenation, which
// its JIT can't scan).
const BG = [
  'var(--color-surface-2)',
  'color-mix(in oklab, var(--color-accent) 25%, var(--color-surface-2))',
  'color-mix(in oklab, var(--color-accent) 50%, var(--color-surface-2))',
  'color-mix(in oklab, var(--color-accent) 75%, var(--color-surface-2))',
  'var(--color-accent)',
] as const;

function Cell({ cell }: { cell: HeatmapCell }): ReactNode {
  const box = (
    <span
      className="tap block aspect-square rounded"
      style={{ background: BG[cell.intensity] }}
      aria-hidden={cell.total === 0 ? true : undefined}
    />
  );
  if (cell.total === 0) return box;
  return (
    <Link
      prefetch={false}
      href={`/records?date=${cell.date}`}
      aria-label={`${formatDayHeading(cell.date)}: ${formatBahtWhole(cell.total)}`}
    >
      {box}
    </Link>
  );
}

// A calendar-ish glance at where a cycle's spending fell — 7 columns, one square per day, darker =
// heavier. CSS grid, not an ECharts calendar: the chart coordinate is cramped at 412px and a plain
// grid themes and taps for free. Tap a populated day to see that day's records.
export function SpendHeatmap({ cells }: { cells: HeatmapCell[] }) {
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Daily spending this cycle">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Daily spending
      </h2>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c) => (
          <Cell key={c.date} cell={c} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/ui/SpendHeatmap.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render it on the analytics page**

In `src/app/analytics/page.tsx`:
- Add import: `import { SpendHeatmap } from '@features/entries/ui/SpendHeatmap';`
- Add `heatmapCells` to the destructure at line 41.
- After the main `</section>` (closing the trend panel, ~line 160), before `</PageContainer>`, add:
```tsx
      <SpendHeatmap cells={heatmapCells} />
```
(If the page's top-level children need a wrapping flex column for spacing, add one covering the panel + heatmap + top-notes; match the 412px gap of the existing layout.)

- [ ] **Step 6: Verify gates + 412px browser**

Run: `npm run typecheck && npm run lint && npm test`
Then at 412px on `/analytics`: confirm the grid renders one square per cycle day, heavier days darker, empty days bare; tapping a populated day lands on that day's records. Verify in both light and dark theme.

- [ ] **Step 7: Commit**

```bash
npm run format:files src/features/entries/ui/SpendHeatmap.tsx src/features/entries/ui/SpendHeatmap.test.tsx src/app/analytics/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/SpendHeatmap.tsx src/features/entries/ui/SpendHeatmap.test.tsx src/app/analytics/page.tsx
git commit -m "feat(app): spend heatmap on analytics — a daily-intensity grid for the cycle" -m "7-col CSS grid, darker = heavier, empty days bare; tap a day for its records. No ECharts — the calendar coordinate is cramped at 412px and a grid themes/taps for free." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Top-notes list on the analytics page

**Files:**
- Create: `src/features/entries/ui/TopNotesList.tsx`
- Test: `src/features/entries/ui/TopNotesList.test.tsx`
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `NoteRow[]` (Task 5) from `data.topNotes`; `formatBahtWhole`.
- Produces: `TopNotesList({ notes }: { notes: NoteRow[] })` — a ranked list; renders `null` when empty.

- [ ] **Step 1: Write the failing component test**

Create `src/features/entries/ui/TopNotesList.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopNotesList } from './TopNotesList';

describe('TopNotesList', () => {
  it('renders nothing when there are no notes', () => {
    const { container } = render(<TopNotesList notes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists notes with their totals and counts', () => {
    render(
      <TopNotesList
        notes={[
          { note: 'Starbucks', total: 200, count: 2 },
          { note: '7-11', total: 60, count: 1 },
        ]}
      />,
    );
    expect(screen.getByText('Starbucks')).toBeInTheDocument();
    expect(screen.getByText(/\(2\)/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/ui/TopNotesList.test.tsx`
Expected: FAIL — cannot find module `./TopNotesList`.

- [ ] **Step 3: Write the component**

Create `src/features/entries/ui/TopNotesList.tsx`. Cap the list so a long-tail ledger doesn't render hundreds of rows:

```tsx
import type { NoteRow } from '../by-note';
import { formatBahtWhole } from '@shared/money';

const MAX_ROWS = 12;

// "Where did it actually go" at merchant granularity — the cycle's spend ranked by note text (see
// topNotes), the question the category breakdown can't answer. A plain ranked list is the honest
// form for free text: no chart, no icon (a note has no hue). Capped at MAX_ROWS — the long tail of
// one-off notes isn't worth the scroll.
export function TopNotesList({ notes }: { notes: NoteRow[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Top notes this cycle">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Top notes
      </h2>
      <ul className="flex flex-col gap-2.5">
        {notes.slice(0, MAX_ROWS).map((n) => (
          <li key={n.note} className="flex items-center gap-3 text-sm">
            <span className="flex min-w-0 flex-1 items-baseline gap-1">
              <span className="truncate">{n.note}</span>
              <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                ({n.count})
              </span>
            </span>
            <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
              {formatBahtWhole(n.total)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/ui/TopNotesList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render it on the analytics page**

In `src/app/analytics/page.tsx`:
- Add import: `import { TopNotesList } from '@features/entries/ui/TopNotesList';`
- Add `topNotes` to the destructure at line 41.
- After `<SpendHeatmap cells={heatmapCells} />`, add:
```tsx
      <TopNotesList notes={topNotes} />
```

- [ ] **Step 6: Verify gates + 412px browser**

Run: `npm run typecheck && npm run lint && npm test`
Then at 412px on `/analytics`: confirm the notes list ranks by amount, shows counts, truncates long notes, and is absent on an empty cycle. Confirm the whole analytics page (banner + trend + heatmap + notes) reads well stacked at 412px in light and dark.

- [ ] **Step 7: Commit + finish the branch**

```bash
npm run format:files src/features/entries/ui/TopNotesList.tsx src/features/entries/ui/TopNotesList.test.tsx src/app/analytics/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/TopNotesList.tsx src/features/entries/ui/TopNotesList.test.tsx src/app/analytics/page.tsx
git commit -m "feat(app): top-notes list on analytics — spend ranked by note text" -m "Merchant-level 'where did it go' the category breakdown can't answer; ranked list, capped at 12, absent on an empty cycle." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

After this task, use `superpowers:finishing-a-development-branch` to decide how to integrate `feat/insight-round`.

---

## Self-Review

**Spec coverage:**
- Feature I (upcoming bills) → Tasks 1–4. ✓ pure fns + dashboard math + wiring + render.
- Feature G (top notes) → Tasks 5, 8, 11. ✓
- Feature F (heatmap) → Tasks 6, 8, 10. ✓
- Feature H (anomaly) → Tasks 7, 8, 9. ✓ **Deviation from spec:** renders on `/analytics`, not the dashboard — the per-category-per-cycle matrix H needs already lives in `use-analytics`, and the dashboard is deliberately current-cycle-only. Flagged to the user.
- B and D → documented as dropped in the spec; no tasks, correct.

**Placeholder scan:** no TBD/TODO; every code step shows complete code. Two steps ("mirror the existing seed helpers" in Tasks 4/8 test steps) intentionally defer to existing test utilities rather than duplicate them — the assertion code is given; the seeding reuses what the file already has, which the executor must read. That's reuse, not a placeholder.

**Type consistency:**
- `postsBetween(rule, afterIso, throughIso): Due[]` — same name/shape in Tasks 1, 2. ✓
- `Committed = { total, count }`, `committedThisCycle(...)` — Tasks 2, 4. ✓
- `safeToSpendPerDay(totalBudget, spent, committed, daysLeft)` — Tasks 3, 4 pass 4 args. ✓
- `NoteRow`, `topNotes` — Tasks 5, 8, 11. ✓
- `HeatmapCell`, `toHeatmapCells` — Tasks 6, 8, 10. ✓
- `Anomaly`, `anomalies(matrix, subjectKey, threshold?)` — Tasks 7, 8, 9. ✓
- `AnalyticsData` additions (`topNotes`, `heatmapCells`, `anomalies`) defined in Task 8, consumed in 9–11. ✓

**Known executor checks (called out inline, not placeholders):**
- Task 10 depends on the Records day-filter param (`?date=`); the step says to confirm it and gives a fallback if absent.
- Tasks 4 & 8 test steps depend on the hooks' existing DB-seeding test helpers; the step says to read and reuse them.
