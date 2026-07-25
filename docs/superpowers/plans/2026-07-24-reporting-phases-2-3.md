# Reporting Phases 2 & 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two deferred reporting features from the reporting-IA-redesign spec — **Phase 2: Top transactions** (the cycle's largest single expenses, on Home) and **Phase 3: Spending by account** (a By category / By account toggle on Trends).

**Architecture:** Both are additive and lean on primitives that already exist. Phase 2 mirrors the `topNotes` pattern: a pure `topTransactions(entries)` function, a `TopTransactionsList` component, and a `getEntriesInRange` call added to `useHome`; plus a new `?sort=amount` mode in Records so the panel's "See all" lands on the biggest-first list. Phase 3 adds a `?by=` param to Trends and swaps the breakdown list's data source from `getCategoryBreakdown` to the already-existing `getAccountBreakdown` (with `getAccountIconMap`/`getAccountHueMap` + the `AccountIcon` component), account rows linking to the existing `/records?account=` filter.

**Tech Stack:** Next.js 16 App Router (static export, all `'use client'`), React 19, TypeScript 5.9 strict, Tailwind v4, Vitest + `@testing-library/react` (`renderHook`), SQLite-wasm/OPFS in the browser with a better-sqlite3 node-proxy shim for tests.

## Global Constraints

- **Offline / no server / single-user / spending-only (outflows).** Stored amounts are negative; show `Math.abs`. Never relax the `amount < 0` read filter.
- **TS bans (ESLint errors):** no `any`, no `as`, no `!`, no `@ts-*` comments; `type` over `interface`; `for..of` over `forEach`.
- **Money:** `formatBahtWhole` for computed/glance figures, `formatBaht` for stored amounts; THB; digits use `tnum` (tabular-nums), no monospace.
- **Reads are async, post-mount.** Every read hook returns `{ ready, data }`; the route shows a skeleton/`…` until `ready`. Reactive refetch via `useDataVersion()`.
- **`?cycle=` anchors the page** to the selected cycle; params ride on `useSearchParams`.
- **No new SQLite table/column.** Do NOT touch `src/db/worker.ts` BOOTSTRAP_SQL, any `schema.ts`, or the schema-lockstep test. Every query this plan needs already exists.
- **Confirmed scope decisions (from the design round):**
  - Phase 2 "See all" links to Records' new `?sort=amount` mode; the Home panel itself is a capped top-N list whose rows tap through to the entry's edit page.
  - Phase 3 toggle swaps ONLY the breakdown list (the trend chart, average, budget line, delta, heatmap, notes are unchanged); account rows link to `/records?account=` (no by-account trend filtering); the toggle shows only in the unfiltered (`?category=` absent) view.
- **Quality gates before every commit** (run separately): `npm run format:files <changed files>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`.
- **Commit format:** `type(scope): subject` + repeated `-m` body; scopes `features`, `app`; no `Claude-Session:` trailer.
- **Layout is browser-verified, not unit-tested** (per CLAUDE.md the node shim never exercises layout). Page-render tasks note a deferred 412px browser check; the controller runs a consolidated pass.
- **Environment:** run shell via Git Bash (POSIX), not PowerShell. `git diff` bodies are stripped by a compressor — read changed files with the Read tool. An empty grep is not proof of absence.

---

## Phase 2 — Top transactions

### Task 1: `topTransactions` pure function

**Files:**
- Create: `src/features/entries/top-transactions.ts`
- Test: `src/features/entries/top-transactions.test.ts`

**Interfaces:**
- Consumes: `EntryRow` from `./schema` (fields include `id: number`, `date: string`, `amount: number` (negative), `category: string`, `note: string | null`).
- Produces: `topTransactions(entries: EntryRow[], limit?: number): EntryRow[]` — the `limit` largest entries by `Math.abs(amount)`, biggest first. Default `limit` = `TOP_TX_LIMIT` (5).

- [ ] **Step 1: Write the failing test**

Create `src/features/entries/top-transactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { topTransactions, TOP_TX_LIMIT } from './top-transactions';
import type { EntryRow } from './schema';

// Minimal EntryRow factory — only the fields topTransactions reads matter; the rest are filled to
// satisfy the type. Amounts are negative (outflows), matching the ledger.
function row(id: number, amount: number): EntryRow {
  return {
    id,
    date: '2026-07-20',
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: null,
    originalAmount: null,
    note: null,
    source: null,
    category: 'Food',
    account: 'Cash',
  };
}

describe('topTransactions', () => {
  it('ranks by magnitude (biggest outflow first) and caps at the limit', () => {
    const entries = [row(1, -100), row(2, -900), row(3, -50), row(4, -300), row(5, -20), row(6, -600)];
    const top = topTransactions(entries, 3);
    expect(top.map((e) => e.id)).toEqual([2, 6, 4]); // 900, 600, 300
  });

  it('defaults to TOP_TX_LIMIT and does not mutate the input', () => {
    const entries = [row(1, -10), row(2, -20), row(3, -30), row(4, -40), row(5, -50), row(6, -60)];
    const snapshot = entries.map((e) => e.id);
    const top = topTransactions(entries);
    expect(top).toHaveLength(TOP_TX_LIMIT); // 5
    expect(top[0].id).toBe(6); // largest
    expect(entries.map((e) => e.id)).toEqual(snapshot); // input order untouched
  });

  it('returns everything (sorted) when fewer than the limit', () => {
    expect(topTransactions([row(1, -10), row(2, -30)], 5).map((e) => e.id)).toEqual([2, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- top-transactions`
Expected: FAIL — module `./top-transactions` does not exist.

- [ ] **Step 3: Implement**

Create `src/features/entries/top-transactions.ts`:

```ts
import type { EntryRow } from './schema';

// How many of the cycle's largest single expenses the Home panel shows. Small — this is a glance at
// the outliers, not a full list (that's Records → ?sort=amount). Tunable in one place.
export const TOP_TX_LIMIT = 5;

// The cycle's biggest single expenses, biggest first. The category breakdown answers "which buckets",
// top-notes answers "which merchants"; this answers "which single purchases blew the cycle". Ranks by
// magnitude (the ledger stores outflows negative) and copies the array before sorting so the caller's
// order (e.g. the chronological cycle list) is untouched.
export function topTransactions(entries: EntryRow[], limit: number = TOP_TX_LIMIT): EntryRow[] {
  return [...entries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- top-transactions`
Expected: PASS (3 tests).

- [ ] **Step 5: Format, gate, commit**

```bash
npm run format:files src/features/entries/top-transactions.ts src/features/entries/top-transactions.test.ts
npm run typecheck && npm run lint && npm test -- top-transactions
git add src/features/entries/top-transactions.ts src/features/entries/top-transactions.test.ts
git commit -m "feat(features): add topTransactions pure fn" -m "Ranks a cycle's entries by magnitude, biggest first, capped at TOP_TX_LIMIT (5). Mirrors topNotes; feeds the Home top-transactions panel next."
```

---

### Task 2: `useHome` loads entries + `topTransactions`

**Files:**
- Modify: `src/features/entries/use-home.ts`
- Test: `src/features/entries/use-home.test.ts`

**Interfaces:**
- Consumes: `topTransactions` from `./top-transactions` (Task 1); `getEntriesInRange(db, start, end): Promise<EntryRow[]>` from `./queries`.
- Produces: `topTransactions: EntryRow[]` on `HomeData` — the active cycle's largest expenses. Follows `?cycle=` (computed for whatever cycle is on screen, like `categoryBreakdown`), NOT current-cycle-only.

- [ ] **Step 1: Write the failing test**

Add to `src/features/entries/use-home.test.ts` (the file already mocks `@db/browser` + `todayIso`, seeds three July entries totaling 170 in cycle `2026-06`, and imports `renderHook, waitFor`). Add `EntryRow` is not needed — assert on ids/amounts:

```ts
describe('topTransactions', () => {
  it('exposes the active cycle entries ranked by magnitude, biggest first', async () => {
    const { result } = renderHook(() => useHome('2026-06'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const top = result.current.data?.topTransactions ?? [];
    // Seeded cycle 2026-06: Food -100, Food -50, Transport -20.
    expect(top.map((e) => e.amount)).toEqual([-100, -50, -20]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- use-home`
Expected: FAIL — `topTransactions` missing on `HomeData`.

- [ ] **Step 3: Implement**

In `src/features/entries/use-home.ts`:

Add imports:

```ts
import { getCycleSummary, getCategoryBreakdown, hasAnyExpense, getEntriesInRange, type Summary, type Breakdown } from './queries';
import { topTransactions } from './top-transactions';
import type { EntryRow } from './schema';
```

(The `./queries` import already exists — add `getEntriesInRange` to it. `EntryRow` may already be importable; add the import if not present.)

Add `topTransactions: EntryRow[];` to the `HomeData` type (after `categoryBreakdown: Breakdown[];`).

In the effect, the `Promise.all` that currently fetches `[summary, categoryBreakdown]` also fetches the cycle's entries — extend it:

```ts
const [summary, categoryBreakdown, cycleEntries] = await Promise.all([
  getCycleSummary(db, cycle.start, cycle.end),
  getCategoryBreakdown(db, cycle.start, cycle.end),
  getEntriesInRange(db, cycle.start, cycle.end),
]);
```

Before `setData`, compute:

```ts
const topTx = topTransactions(cycleEntries);
```

Add `topTransactions: topTx,` to the `setData({ ... })` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- use-home`
Expected: PASS (existing useHome tests stay green — the field is additive).

- [ ] **Step 5: Format, gate, commit**

```bash
npm run format:files src/features/entries/use-home.ts src/features/entries/use-home.test.ts
npm run typecheck && npm run lint && npm test -- use-home
git add src/features/entries/use-home.ts src/features/entries/use-home.test.ts
git commit -m "feat(features): load the active cycle's top transactions in useHome" -m "useHome now fetches the cycle entries and exposes topTransactions (largest first) alongside the category breakdown, for the Home top-transactions panel. Follows ?cycle= like the breakdown."
```

---

### Task 3: `TopTransactionsList` + render on Home

**Files:**
- Create: `src/features/entries/ui/TopTransactionsList.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `HomeData.topTransactions` (Task 2); `EntryRow`; `CategoryIcon` from `@features/categories/ui/CategoryIcon`; `emojiFor`/`hueFor` from `@features/categories/queries`; `formatBaht` + `formatDayHeading` (see the existing `DashboardCards` RecentCard render, now in git history, for the exact row shape) — mirror `TopNotesList.tsx` for the panel shell.
- Produces: `TopTransactionsList` component.

- [ ] **Step 1: Create the component**

Create `src/features/entries/ui/TopTransactionsList.tsx` — the `TopNotesList` panel shell, but rows are individual entries (category icon + note/category + date + amount) linking to the entry's edit page, plus a "See all" to Records sorted by amount:

```tsx
import Link from 'next/link';
import type { EntryRow } from '../schema';
import type { IconSet } from '@features/settings/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBaht } from '@shared/money';
import { formatDayHeading } from '@shared/date';

// The cycle's biggest single purchases (see topTransactions) — the outliers the category donut
// averages away. A ranked list of individual entries: category disc + the note (or category when
// untitled) + its day, tapping through to that entry. "See all" opens Records ranked biggest-first.
// Renders nothing when the cycle has no spend (the caller only mounts it inside the spending branch,
// but guard anyway so it's safe to place elsewhere).
export function TopTransactionsList({
  entries,
  emojiMap,
  hueMap,
  iconSet,
  cycleKey,
}: {
  entries: EntryRow[];
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  cycleKey: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Top transactions this cycle">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          Top transactions
        </h2>
        <Link
          href={`/records?cycle=${cycleKey}&sort=amount`}
          prefetch={false}
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          See all →
        </Link>
      </div>
      <ul className="flex flex-col gap-2.5">
        {entries.map((e) => (
          <li key={e.id}>
            <Link
              prefetch={false}
              href={`/entries/edit?id=${e.id}`}
              // Lead with the note (the visible primary line) when present, keeping the category for
              // context — the icon is aria-hidden, so without this a screen reader loses it.
              aria-label={`${e.note ? `${e.note} (${e.category})` : e.category} ${formatBaht(Math.abs(e.amount))} on ${formatDayHeading(e.date)}`}
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
              <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
                {formatBaht(Math.abs(e.amount))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

> If `formatDayHeading` is not exported from `@shared/date`, Read that module and use the day-heading formatter it does export (the old `DashboardCards` RecentCard used `formatDayHeading` — confirm the name before relying on it).

- [ ] **Step 2: Render it on Home**

In `src/app/page.tsx`:

Add the import:

```tsx
import { TopTransactionsList } from '@features/entries/ui/TopTransactionsList';
```

Add `topTransactions` to the `data` destructure.

Render it inside the `hasSpending` branch, immediately after the `</CycleSwipe>` closing tag (the block that holds the donut/breakdown) and before that branch's closing `</>`:

```tsx
<TopTransactionsList
  entries={topTransactions}
  emojiMap={emojiMap}
  hueMap={hueMap}
  iconSet={iconSet}
  cycleKey={activeKey}
/>
```

- [ ] **Step 3: Gate**

```bash
npm run format:files src/features/entries/ui/TopTransactionsList.tsx src/app/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
```
Expected: all green (no new unit test — page/layout is browser-verified; the ranking is covered by Task 1).

- [ ] **Step 4: Commit**

```bash
git add src/features/entries/ui/TopTransactionsList.tsx src/app/page.tsx
git commit -m "feat(app): show top transactions on Home" -m "A ranked panel of the cycle's biggest single expenses below the breakdown; each row taps through to the entry, and See all opens Records ranked by amount. Browser check deferred to the consolidated pass."
```

> Browser check (deferred, consolidated): at 412px, a cycle with spend shows the Top transactions panel below the category breakdown, biggest first; a row opens `/entries/edit?id=`; "See all" opens `/records?cycle=…&sort=amount`.

---

### Task 4: Records `?sort=amount` mode

**Files:**
- Modify: `src/features/entries/use-records.ts`
- Modify: `src/app/records/page.tsx`
- Test: `src/features/entries/use-records.test.ts`

**Interfaces:**
- Consumes: existing `useRecords`/`RecordsParams`/`RecordsData` (see `use-records.ts`). `getEntriesInRange` already fetched as `inCycle`.
- Produces: a `sort?: string` param on `RecordsParams`; when `sort === 'amount'` (and not searching/trip/allCategory), the active cycle's entries render as a SINGLE section keyed `'amount'`, ordered by `Math.abs(amount)` desc.

- [ ] **Step 1: Write the failing test**

Read `src/features/entries/use-records.test.ts` first to match its harness (db seeding, `todayIso` mock, how it calls `useRecords({...})`). Add a test that seeds a cycle with out-of-order amounts and asserts `sort:'amount'` yields one section, biggest first:

```ts
describe('sort=amount', () => {
  it('ranks the cycle entries biggest-first in a single section', async () => {
    // Seed the active cycle with three entries of differing magnitude (adapt keys/dates to the
    // file's existing cutoff + todayIso mock so they land in the active cycle).
    // Assert: data.sections has length 1, and its entries are ordered by |amount| desc.
    const { result } = renderHook(() => useRecords({ sort: 'amount' }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const sections = result.current.data?.sections ?? [];
    expect(sections).toHaveLength(1);
    const amounts = sections[0].entries.map((e) => Math.abs(e.amount));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a)); // already descending
  });
});
```

> Fill the seeding to match the file's existing `beforeEach` (same table setup + `addEntries`). Keep amounts negative. The assertion pattern — one section, `|amount|` descending — is what must hold.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- use-records`
Expected: FAIL — `sort` unknown; entries still grouped by date (multiple sections / not amount-ordered).

- [ ] **Step 3: Implement**

In `src/features/entries/use-records.ts`:

Add `sort?: string;` to `RecordsParams` (after `to?: string;`).

Destructure it: `const { cycle: cycleParam, category, account, q, view, all, currency, from, to, sort } = params;`

The amount sort applies only to the plain active-cycle view (not search/trip/all-category, which have their own ordering). After `cycleEntries`/`spanAll` are computed and before the `grouped` block, branch:

```ts
const sortByAmount = sort === 'amount' && !spanAll;
```

Replace the `grouped` computation so that when `sortByAmount`, the whole cycle is one ranked section:

```ts
const grouped = sortByAmount
  ? [
      {
        key: 'amount',
        entries: [...cycleEntries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
        total: cycleEntries.reduce((sum, e) => sum + e.amount, 0),
      },
    ]
  : groupBy === 'date'
    ? groupByDate(ordered).map((g) => ({ key: g.date, entries: g.entries, total: g.total }))
    : groupBySpend(ordered, groupBy === 'category' ? (e) => e.category : (e) => e.account);
```

Add `sort` to the effect's dependency array (end of the `[...]`).

- [ ] **Step 4: Render the sorted section header on the page**

In `src/app/records/page.tsx`: read the param — add `const sort = params.get('sort') ?? undefined;` where the other params are read (near `cycle`/`category`/`account`), and pass `sort` into the `useRecords({...})` params object.

Then Read the page's section-header render (how a `RecordsSection.key` becomes a heading for `groupBy==='date'` vs `'category'`/`'account'`). The `'amount'` section key needs a plain heading — render **"Largest first"** for the amount section instead of trying to format `'amount'` as a date or look it up as a category. Add a branch in the header render: when `sort === 'amount'`, the (single) section heading is the literal text `Largest first` (no icon, no date formatting). Keep the existing per-row swipe/edit rendering unchanged.

> This is the one part that must be wired against the real page structure — Read `src/app/records/page.tsx`, find where section keys render as headings, and add the `sort === 'amount'` → "Largest first" branch. Do not change the row rendering.

- [ ] **Step 5: Run test + gate**

```bash
npm test -- use-records
npm run format:files src/features/entries/use-records.ts src/app/records/page.tsx src/features/entries/use-records.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
```
Expected: the new test passes; existing Records tests stay green.

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/use-records.ts src/app/records/page.tsx src/features/entries/use-records.test.ts
git commit -m "feat(app): add a sort-by-amount mode to Records" -m "?sort=amount ranks the active cycle's entries biggest-first in one 'Largest first' section — the target of Home's top-transactions See all. Search/trip/all-category views keep their own ordering."
```

> Browser check (deferred, consolidated): `/records?cycle=…&sort=amount` shows one "Largest first" section, entries by descending amount, rows still swipe-to-edit.

---

## Phase 3 — Spending by account (Trends)

### Task 5: `useAnalytics` gains a `by` (category|account) grouping

**Files:**
- Modify: `src/features/entries/use-analytics.ts`
- Test: `src/features/entries/use-analytics.test.ts`

**Interfaces:**
- Consumes: `getAccountBreakdown(db, start, end): Promise<Breakdown[]>`, `getAccountIconMap(db): Promise<Record<string,string>>`, `getAccountHueMap(db): Promise<Record<string,number>>` from `@features/accounts/queries` (all exist); the existing `aggregate(breakdowns)` helper and per-cycle breakdown loop in `use-analytics.ts`.
- Produces: `useAnalytics(cycleKey, category, by?)` gains a third arg `by?: string`. When `by === 'account'` AND unfiltered (`category` null), the window list aggregates `getAccountBreakdown` instead of `getCategoryBreakdown`, and `AnalyticsData` carries account display maps. New `AnalyticsData` fields: `by: 'category' | 'account'`, `accountIconMap: Record<string,string>`, `accountHueMap: Record<string,number>`. The `categories: CategoryRow[]` list is REUSED to carry whichever grouping is active (rename is out of scope — the rows are `{name,value,count}` either way).

- [ ] **Step 1: Read the hook, then write the failing test**

Read `src/features/entries/use-analytics.ts` fully first — note where the per-cycle `getCategoryBreakdown` loop builds the breakdowns that feed `aggregate()`, and where `emojiMap`/`hueMap` are loaded. The `by` swap happens in both places.

Add to `src/features/entries/use-analytics.test.ts` (match its existing seeding/`todayIso` harness). Seed entries across two accounts and assert the account grouping:

```ts
describe('by=account', () => {
  it('aggregates the window by account when by="account" and unfiltered', async () => {
    // Seed the active cycle with entries on two accounts (e.g. Cash -100/-50, Card -200), adapting
    // dates/keys to the file's cutoff + todayIso so they land in the window's anchor cycle.
    const { result } = renderHook(() => useAnalytics(null, null, 'account'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const rows = result.current.data?.categories ?? [];
    // Ranked by magnitude: Card 200 then Cash 150.
    expect(rows.map((r) => r.name)).toEqual(['Card', 'Cash']);
    expect(result.current.data?.by).toBe('account');
  });

  it('defaults to category grouping', async () => {
    const { result } = renderHook(() => useAnalytics(null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.by).toBe('category');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- use-analytics`
Expected: FAIL — `useAnalytics` takes only two args / `by` field missing.

- [ ] **Step 3: Implement**

In `src/features/entries/use-analytics.ts`:

Add the account imports:

```ts
import { getAccountBreakdown, getAccountIconMap, getAccountHueMap } from '@features/accounts/queries';
```

Change the signature to accept `by`:

```ts
export function useAnalytics(cycleKey: string | null, category: string | null, by: string | null = null): { ready: boolean; data: AnalyticsData | null } {
```

Add `const grouping: 'account' | 'category' = by === 'account' ? 'account' : 'category';` near the top of the effect.

Add to `AnalyticsData`: `by: 'category' | 'account';`, `accountIconMap: Record<string, string>;`, `accountHueMap: Record<string, number>;`.

Load the account maps alongside `emojiMap`/`hueMap` (extend the existing `Promise.all`): `getAccountIconMap(db)`, `getAccountHueMap(db)`.

Where the per-cycle breakdowns are built (the loop that calls `getCategoryBreakdown(db, c.start, c.end)` per window cycle to feed `aggregate`), use `getAccountBreakdown` instead when `grouping === 'account'`:

```ts
const breakdown = grouping === 'account'
  ? await getAccountBreakdown(db, c.start, c.end)
  : await getCategoryBreakdown(db, c.start, c.end);
```

(Apply the same swap anywhere the unfiltered category list is derived from a single-cycle breakdown. The trend's per-cycle TOTALS are unchanged — account and category breakdowns sum to the same cycle total — so the chart, average, budget line, and delta stay as they are.)

Add `by: grouping,`, `accountIconMap,`, `accountHueMap,` to the `setData({ ... })`. Add `by` to the effect dependency array.

> Keep it scoped: when a `category` filter is active, `by` is irrelevant (the filtered `cycleRows` path is category-only) — leave that path untouched; `by` only affects the unfiltered window list.

- [ ] **Step 4: Run test + gate**

```bash
npm test -- use-analytics
npm run format:files src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
npm run typecheck && npm run lint && npm test -- use-analytics
```
Expected: new tests pass; existing analytics tests stay green (default `by` = category preserves current behavior).

- [ ] **Step 5: Commit**

```bash
git add src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
git commit -m "feat(features): group the Trends window by account when by=account" -m "useAnalytics takes an optional by arg; by='account' aggregates getAccountBreakdown (unfiltered only) and carries the account icon/hue maps. The trend, average, budget line and delta are unchanged — both groupings sum to the same cycle totals."
```

---

### Task 6: Trends `By category | By account` toggle + account rows

**Files:**
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `useAnalytics(cycleParam, category, by)` (Task 5); `AnalyticsData.by`/`accountIconMap`/`accountHueMap`; `AccountIcon` from `@features/accounts/ui/AccountIcon`; `iconForAccount`/`hueForAccount` from `@features/accounts/queries`; the existing `ViewToggle` from `@shared/ui/ViewToggle`.
- Produces: no new exports — a `?by=` param and a segmented toggle in the unfiltered view; account rows link to `/records?cycle=…&account=…`.

- [ ] **Step 1: Read the page, then wire the param + toggle**

Read `src/app/analytics/page.tsx`. It reads `cycle` + `category` from `useSearchParams` and renders the unfiltered category `<ul>` of `<Link>`s to `${base}&category=${name}` with `CategoryIcon`.

Add the param and pass it through:

```tsx
const by = params.get('by');
const { ready, data } = useAnalytics(cycleParam, category, by);
```

Destructure `by`, `accountIconMap`, `accountHueMap` from `data`.

- [ ] **Step 2: Render the toggle (unfiltered view only)**

In the unfiltered branch (`category === null`), above the breakdown `<ul>`, add a `ViewToggle` mirroring Home's Chart/List toggle (see `src/app/page.tsx` for its exact prop shape — `options: { label, active, href }[]`):

```tsx
<ViewToggle
  options={[
    { label: 'By category', active: data.by === 'category', href: `${base}` },
    { label: 'By account', active: data.by === 'account', href: `${base}&by=account` },
  ]}
/>
```

(`base` is the existing `` `/analytics?cycle=${activeKey}` `` — confirm the variable name in the file.)

- [ ] **Step 3: Render account rows when `by === 'account'`**

The unfiltered list currently maps `categories` to `<Link href={`${base}&category=${name}`}>` with `CategoryIcon`. When `data.by === 'account'`, the SAME `categories` rows (they carry account names now) must instead link to Records filtered by account and use `AccountIcon`:

```tsx
// row marker + link differ by grouping; the row body (name, count, amount, chevron) is identical.
const isAccount = data.by === 'account';
// ...inside the map over `categories` (the ranked rows):
<Link
  prefetch={false}
  href={isAccount
    ? `/records?cycle=${activeKey}&account=${encodeURIComponent(c.name)}`
    : `${base}&category=${encodeURIComponent(c.name)}`}
  aria-label={isAccount ? `${c.name} records` : `${c.name} trend`}
  className="flex min-w-0 flex-1 items-center gap-3"
>
  {isAccount ? (
    <AccountIcon name={c.name} icon={iconForAccount(accountIconMap, c.name)} hue={hueForAccount(accountHueMap, c.name)} />
  ) : (
    <CategoryIcon emoji={emojiFor(emojiMap, c.name)} name={c.name} hue={hueFor(hueMap, c.name)} iconSet={iconSet} />
  )}
  {/* existing name/count/amount/chevron spans unchanged */}
</Link>
```

> Read `src/features/accounts/ui/AccountIcon.tsx` for its exact props (the scout notes disc + glyph, sizes sm/md/lg) and match them — do not guess the prop names. Keep the row body (name, `(count)`, amount, `RowChevron`) identical between the two branches; only the marker and the `href`/`aria-label` differ.

- [ ] **Step 4: Gate**

```bash
npm run format:files src/app/analytics/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
```
Expected: all green (no new unit test — the grouping is covered by Task 5; this is page wiring, browser-verified).

- [ ] **Step 5: Commit**

```bash
git add src/app/analytics/page.tsx
git commit -m "feat(app): add a By category / By account toggle to Trends" -m "The unfiltered Trends list gains a segmented toggle (?by=account); account rows use AccountIcon and link to /records?account=. The trend chart and the filtered drill-down are unchanged."
```

> Browser check (deferred, consolidated): on Trends unfiltered, the toggle switches the list between category and account groupings; account rows show the account glyph and open `/records?account=`; the chart/delta/heatmap/notes are unchanged; the toggle is absent in the `?category=` filtered view.

---

## Self-Review

**Spec coverage:**
- Phase 2 top transactions (panel on Home, capped, See all → Records sorted by amount, rows tap through) → Tasks 1–4. ✅
- Phase 3 spending-by-account (By category/By account toggle on Trends, account rows → Records) → Tasks 5–6. ✅
- Confirmed decisions (Records `?sort=amount` added; toggle swaps list only; account rows → `/records?account=`; toggle unfiltered-only) → encoded in Global Constraints + Tasks 4/5/6. ✅

**Placeholder scan:** Genuinely-new logic (topTransactions, the amount sort, the by=account swap) has full code + real tests. The three "Read the file then wire" steps (Task 4 Step 4 page header, Task 5 breakdown loop, Task 6 rows) name the exact file, the exact insertion point, and the exact code to add — they are wiring against live code that must be read for correctness, not hand-waves. No TBD/TODO.

**Type consistency:** `topTransactions(entries, limit?) → EntryRow[]` (Task 1) is consumed by `useHome` (Task 2) and `TopTransactionsList` (Task 3); `HomeData.topTransactions: EntryRow[]` flows Task 2→3; `RecordsParams.sort` (Task 4) is the target of Task 3's "See all"; `useAnalytics(…, by)` + `AnalyticsData.by/accountIconMap/accountHueMap` (Task 5) are consumed by the page (Task 6). `Breakdown`/`CategoryRow` shapes are reused, not renamed.

## Notes
- Phases 2 and 3 are independent; either could ship alone. Order is Phase 2 (Tasks 1–4) then Phase 3 (Tasks 5–6).
- No schema change, no new dependency, no new SQL — every query (`getEntriesInRange`, `getAccountBreakdown`, account maps) already exists.
