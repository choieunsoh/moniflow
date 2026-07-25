# Spending-Insights Drill-Down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make moniflow's Trends (`/analytics`) surface explain *where money went and what changed* by surfacing three insights from data the app already computes — with no new stored data and no OPFS migration.

**Architecture:** All three additions are pure, unit-tested functions plus thin React wrappers, fed by data `use-analytics` already fetches (`matrix`, `bars`, `cycleEntries`). Two new pure modules (`delta-breakdown.ts`, `by-weekday.ts`) and one new card (`WeekdayCard.tsx`); `CycleDeltaCard` gains optional contributor rows; `use-analytics` and `analytics/page.tsx` wire it together. Existing helpers (`cycleDelta`, `topTransactions`/`TopTransactionsList`, `topNotes`/`TopNotesList`) are reused, not rebuilt.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless relative imports), React 19, Next 16 App Router (`'use client'`, static export), Vitest + `@testing-library/react`, Tailwind v4 tokens.

## Global Constraints

- **No new DB column / table / query.** Everything reads from what `use-analytics` already fetches. Do NOT touch `schema.ts`, `worker.ts` `BOOTSTRAP_SQL`, or `column-migrations.ts`.
- **TS bans (errors):** no `any`, no `as`, no `!`, no `// @ts-*`; `type` over `interface`; `for..of` over `forEach`; `as const`/`satisfies` where a literal/contract applies.
- **Matrix cell shape (verbatim):** `Map<string, Map<string, { total: number; count: number }>>` where `total` is a **magnitude** (`use-analytics` stores `Math.abs(row.total)`), outer key = cycle key (`YYYY-MM`), inner key = category name.
- **Money formatting by provenance:** `formatBahtWhole` for glance figures (states satang, short). Do not hand-format.
- **Dates:** entry `date` is a UTC-stable `YYYY-MM-DD` key. Derive weekday via `Intl.DateTimeFormat` with `timeZone: 'UTC'` — never string-slice.
- **Sign:** the ledger stores outflows negative; pure fns work in magnitudes (`Math.abs`) and rank biggest-first.
- **Verify at 412px in a real browser** before considering UI done — the Node shim proves queries only, never the worker/OPFS/layout.
- **Branch:** implement on a feature branch, not `main` (the spec doc is already committed to `main`).

---

## Task 1: `deltaByCategory` — which categories drove the cycle-over-cycle change

**Files:**
- Create: `src/features/entries/delta-breakdown.ts`
- Test: `src/features/entries/delta-breakdown.test.ts`

**Interfaces:**
- Consumes: the matrix type from the Global Constraints.
- Produces:
  - `type DeltaContributor = { category: string; delta: number }` (positive = spent MORE this cycle)
  - `function deltaByCategory(matrix: Map<string, Map<string, { total: number; count: number }>>, activeKey: string, prevKey: string): DeltaContributor[]` — ranked by `|delta|` desc, ties broken by category name asc; zero-net categories omitted.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { deltaByCategory } from './delta-breakdown';

type Cell = { total: number; count: number };
// Matrix builder — totals are magnitudes, mirroring use-analytics.
function m(rows: Record<string, Record<string, number>>): Map<string, Map<string, Cell>> {
  return new Map(
    Object.entries(rows).map(([key, cats]) => [
      key,
      new Map(Object.entries(cats).map(([c, total]) => [c, { total, count: 1 }])),
    ]),
  );
}

describe('deltaByCategory', () => {
  it('ranks increases and decreases by magnitude, positive = spent more', () => {
    const matrix = m({
      '2026-06': { Food: 1000, Transport: 800, Fun: 300 },
      '2026-07': { Food: 1420, Transport: 600, Fun: 300 },
    });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([
      { category: 'Food', delta: 420 },
      { category: 'Transport', delta: -200 },
    ]);
  });

  it('treats a category new this cycle as a full increase', () => {
    const matrix = m({ '2026-06': { Food: 1000 }, '2026-07': { Food: 1000, Rent: 5000 } });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([{ category: 'Rent', delta: 5000 }]);
  });

  it('treats a category dropped this cycle as a full decrease', () => {
    const matrix = m({ '2026-06': { Food: 1000, Gym: 700 }, '2026-07': { Food: 1000 } });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([{ category: 'Gym', delta: -700 }]);
  });

  it('omits zero-net categories and breaks ties by name', () => {
    const matrix = m({
      '2026-06': { A: 100, B: 500, C: 999 },
      '2026-07': { A: 300, B: 700, C: 999 }, // A +200, B +200 (tie), C unchanged (omit)
    });
    expect(deltaByCategory(matrix, '2026-07', '2026-06')).toEqual([
      { category: 'A', delta: 200 },
      { category: 'B', delta: 200 },
    ]);
  });

  it('returns empty when a cycle is missing', () => {
    expect(deltaByCategory(m({ '2026-07': { Food: 100 } }), '2026-07', '2026-06')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- delta-breakdown`
Expected: FAIL — `deltaByCategory` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/entries/delta-breakdown.ts

// Which categories drove this cycle's change vs the previous one — the "why" behind the single
// CycleDeltaCard total. Reads the in-memory matrix use-analytics already builds (magnitudes), so no
// extra query. delta = active − prev; positive means you spent MORE this cycle. A category present in
// only one of the two cycles counts its whole side (missing side = 0). Zero-net categories are noise
// in a "what changed" list, so they're dropped. Ranked by magnitude, ties by name for a stable order.
export type DeltaContributor = { category: string; delta: number };

export function deltaByCategory(
  matrix: Map<string, Map<string, { total: number; count: number }>>,
  activeKey: string,
  prevKey: string,
): DeltaContributor[] {
  const active = matrix.get(activeKey);
  const prev = matrix.get(prevKey);
  if (active === undefined || prev === undefined) return [];

  const names = new Set<string>();
  for (const name of active.keys()) names.add(name);
  for (const name of prev.keys()) names.add(name);

  const rows: DeltaContributor[] = [];
  for (const name of names) {
    const delta = (active.get(name)?.total ?? 0) - (prev.get(name)?.total ?? 0);
    if (delta !== 0) rows.push({ category: name, delta });
  }
  return rows.sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.category.localeCompare(b.category),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- delta-breakdown`
Expected: PASS (5 tests).

- [ ] **Step 5: Format, typecheck, lint, commit**

```bash
npm run format:files src/features/entries/delta-breakdown.ts src/features/entries/delta-breakdown.test.ts
npm run typecheck && npm run lint
git add src/features/entries/delta-breakdown.ts src/features/entries/delta-breakdown.test.ts
git commit -m "feat(entries): deltaByCategory — rank what drove the cycle-over-cycle change" -m "Pure fn over the existing analytics matrix; positive delta = spent more, missing side counts as 0, zero-net omitted, ranked by magnitude then name."
```

---

## Task 2: `CycleDeltaCard` contributor rows + wire `deltaBreakdown` (unfiltered)

**Files:**
- Modify: `src/features/entries/ui/CycleDeltaCard.tsx`
- Test: `src/features/entries/ui/CycleDeltaCard.test.tsx` (create)
- Modify: `src/features/entries/use-analytics.ts`
- Modify: `src/app/analytics/page.tsx:234`

**Interfaces:**
- Consumes: `DeltaContributor` from Task 1; `CategoryIcon` (`{ emoji, name, hue, iconSet }`); `emojiFor`/`hueFor` from `@features/categories/queries`.
- Produces: `AnalyticsData.deltaBreakdown: DeltaContributor[]` (empty when filtered). `CycleDeltaCard` accepts optional `contributors`, `emojiMap`, `hueMap`, `iconSet`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycleDeltaCard } from './CycleDeltaCard';

describe('CycleDeltaCard contributors', () => {
  it('lists the top movers under the total with direction arrows', () => {
    render(
      <CycleDeltaCard
        delta={{ delta: 220, direction: 'up', prevTotal: 4000 }}
        contributors={[
          { category: 'Food', delta: 420 },
          { category: 'Transport', delta: -200 },
        ]}
        emojiMap={{}}
        hueMap={{}}
        iconSet="emoji"
      />,
    );
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText(/↑.*420/)).toBeInTheDocument();
    expect(screen.getByText('Transport')).toBeInTheDocument();
    expect(screen.getByText(/↓.*200/)).toBeInTheDocument();
  });

  it('renders no contributor list when none are given (backward compatible)', () => {
    render(<CycleDeltaCard delta={{ delta: 220, direction: 'up', prevTotal: 4000 }} />);
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CycleDeltaCard`
Expected: FAIL — `contributors` prop not supported; movers not rendered.

- [ ] **Step 3: Implement contributor rows in `CycleDeltaCard`**

Replace the component signature and add a contributor list before the closing `</section>` of the "up/down" branch. Full new file:

```tsx
import type { CycleDelta } from '../dashboard';
import type { DeltaContributor } from '../delta-breakdown';
import type { IconSet } from '@features/settings/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBahtWhole } from '@shared/money';

// "This cycle vs last" — the headline total (moved off /dashboard onto Trends). When `contributors`
// are supplied (unfiltered only) it also lists the top movers that drove the total: the "what
// changed" answer the bare number can't give. delta === null → no comparable earlier cycle. up =
// spending more (loss red), down = less (accent).
export function CycleDeltaCard({
  delta,
  contributors = [],
  emojiMap = {},
  hueMap = {},
  iconSet = 'emoji',
}: {
  delta: CycleDelta | null;
  contributors?: DeltaContributor[];
  emojiMap?: Record<string, string>;
  hueMap?: Record<string, number>;
  iconSet?: IconSet;
}) {
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
    <section className="panel flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          This cycle vs last
        </h2>
        <span className="tnum text-2xl font-semibold" style={{ color }}>
          {up ? '↑' : '↓'} {formatBahtWhole(Math.abs(delta.delta))}
        </span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {up ? 'more than' : 'less than'} last cycle ({formatBahtWhole(delta.prevTotal)})
        </span>
      </div>
      {contributors.length > 0 ? (
        <ul className="flex flex-col gap-2.5 border-t pt-3" style={{ borderColor: 'var(--color-line)' }}>
          {contributors.map((c) => {
            const rose = c.delta > 0;
            return (
              <li key={c.category} className="flex items-center gap-3 text-sm">
                <CategoryIcon
                  emoji={emojiFor(emojiMap, c.category)}
                  name={c.category}
                  hue={hueFor(hueMap, c.category)}
                  iconSet={iconSet}
                />
                <span className="min-w-0 flex-1 truncate">{c.category}</span>
                <span
                  className="tnum shrink-0"
                  style={{ color: rose ? 'var(--color-loss)' : 'var(--color-accent-text)' }}
                >
                  {rose ? '↑' : '↓'} {formatBahtWhole(Math.abs(c.delta))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
```

Note: if `--color-line` is not a defined token, use `var(--color-faint)` (both appear in `globals.css`; confirm and pick the one used for hairline separators elsewhere).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CycleDeltaCard`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire `deltaBreakdown` into `use-analytics`**

In `src/features/entries/use-analytics.ts`:

Add the import near the other pure-module imports:
```ts
import { deltaByCategory, type DeltaContributor } from './delta-breakdown';
```

Add to the `AnalyticsData` type (after `delta`):
```ts
  // The top categories that drove `delta`, unfiltered only (empty when filtered). Powers the
  // CycleDeltaCard "what changed" rows.
  deltaBreakdown: DeltaContributor[];
```

Compute it just after the existing `delta` derivation (which already has `lastBar`/`prevBar`), using the matrix cycle keys:
```ts
      // Unfiltered only: which categories moved the total. The window's last two cycle keys are the
      // active cycle and the one before it — the same pair `delta` compares.
      const prevCycleKey = cycles[cycles.length - 2]?.key;
      const deltaBreakdown =
        category === null && delta !== null && prevCycleKey !== undefined
          ? deltaByCategory(matrix, activeKey, prevCycleKey).slice(0, 4)
          : [];
```

Add `deltaBreakdown` to the `setData({ ... })` call.

- [ ] **Step 6: Render it on the page**

In `src/app/analytics/page.tsx`, add `deltaBreakdown` to the destructured `data` (near `delta`), then replace line 234:

```tsx
      {delta !== null ? (
        <CycleDeltaCard
          delta={delta}
          contributors={deltaBreakdown}
          emojiMap={emojiMap}
          hueMap={hueMap}
          iconSet={iconSet}
        />
      ) : null}
```

- [ ] **Step 7: Verify gates + browser**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all pass.
Then `npm run dev:web`, open `/analytics` at 412px, confirm the delta card now lists the top movers with up/down arrows and correct colours; confirm filtered (`?category=…`) shows NO contributor rows.

- [ ] **Step 8: Format + commit**

```bash
npm run format:files src/features/entries/ui/CycleDeltaCard.tsx src/features/entries/ui/CycleDeltaCard.test.tsx src/features/entries/use-analytics.ts src/app/analytics/page.tsx
git add -A
git commit -m "feat(entries): show what changed — top movers on the cycle-delta card" -m "CycleDeltaCard gains optional contributor rows fed by deltaByCategory; wired unfiltered in use-analytics + analytics page. The total delta now explains which categories drove it."
```

---

## Task 3: Per-category "vs last cycle" in the filtered view

**Files:**
- Modify: `src/features/entries/use-analytics.ts` (the `delta` derivation)

**Interfaces:**
- Consumes: existing `bars` (when filtered, these are the selected category's per-cycle spend), `cycleDelta` from `./dashboard`.
- Produces: `AnalyticsData.delta` is now non-null in the filtered view too (the category's active-vs-previous delta). No new field.

- [ ] **Step 1: Add the failing test to `use-analytics.test.ts`**

Find the existing `use-analytics.test.ts` and its render/setup helper. Add a test asserting that with a `category` argument and ≥2 non-zero cycles for it, `data.delta` is non-null and equals the category's last-two-bar difference. Model it on the existing unfiltered delta test in that file (reuse its db-seeding helper). Concretely, the assertion is:

```ts
// After seeding the same category in two consecutive cycles (e.g. 1000 then 1400) and rendering
// useAnalytics(activeKey, 'Food'):
expect(result.current.data?.delta).toEqual({ delta: 400, direction: 'up', prevTotal: 1000 });
expect(result.current.data?.deltaBreakdown).toEqual([]); // still unfiltered-only
```

> If `use-analytics.test.ts` has no seeding helper for two cycles, add one mirroring the unfiltered delta test already present. Do not invent a new harness — reuse the file's existing `renderHook` + Node-shim db setup.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- use-analytics`
Expected: FAIL — `data.delta` is `null` when filtered.

- [ ] **Step 3: Lift the `category === null` guard on `delta`**

In `use-analytics.ts`, the current derivation is:
```ts
      const delta =
        category === null && lastBar !== undefined ? cycleDelta(lastBar.value, prevTotal) : null;
```
Replace with (delta now computed for both filtered and unfiltered — when filtered, `lastBar`/`prevBar` are the category's own per-cycle values):
```ts
      // Filtered, `bars` is this category's per-cycle spend, so the last two bars give the category's
      // own current-vs-previous delta — the per-category "vs last cycle" the user asked for.
      // Unfiltered they are the whole-cycle totals. Either way a zero prev bar means no comparable
      // earlier cycle (null). deltaBreakdown stays unfiltered-only (Task 2's guard).
      const delta = lastBar !== undefined ? cycleDelta(lastBar.value, prevTotal) : null;
```

Ensure Task 2's `deltaBreakdown` guard already restricts contributors to `category === null` (it does). No page change needed — line 234 already renders `delta` whenever non-null.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- use-analytics`
Expected: PASS.

- [ ] **Step 5: Verify gates + browser**

Run: `npm run typecheck && npm run lint && npm test`
Open `/analytics?category=<a category with ≥2 cycles>` at 412px; confirm a "This cycle vs last" card now appears for that category with NO contributor rows.

- [ ] **Step 6: Format + commit**

```bash
npm run format:files src/features/entries/use-analytics.ts src/features/entries/use-analytics.test.ts
git add -A
git commit -m "feat(entries): per-category vs-last-cycle delta in the filtered trend view" -m "Lift the unfiltered-only guard on delta; when filtered, bars already hold the category's per-cycle spend so the last two bars give its own delta. Contributors stay unfiltered-only."
```

---

## Task 4: Category-scoped biggest transactions + note rollup

**Files:**
- Modify: `src/features/entries/use-analytics.ts`
- Modify: `src/app/analytics/page.tsx` (filtered branch + guard the supporting block)

**Interfaces:**
- Consumes: `topTransactions` from `./top-transactions`, `topNotes` from `./by-note`, the already-fetched `cycleEntries` (active cycle), components `TopTransactionsList` and `TopNotesList`.
- Produces: `AnalyticsData.categoryTransactions: EntryRow[]` and `AnalyticsData.categoryNotes: NoteRow[]` (both `[]` when unfiltered).

- [ ] **Step 1: Add the failing test to `use-analytics.test.ts`**

Add a test: after seeding the active cycle with several entries in category `Food` (varied amounts + notes) and other categories, `useAnalytics(activeKey, 'Food')` yields `data.categoryTransactions` = the Food entries biggest-first (length ≤ 5) and `data.categoryNotes` ranked by note within Food only; unfiltered, both are `[]`. Reuse the file's existing seeding helper.

```ts
// filtered:
expect(result.current.data?.categoryTransactions.every((e) => e.category === 'Food')).toBe(true);
expect(result.current.data?.categoryTransactions.map((e) => Math.abs(e.amount)))
  .toEqual([...].sort((a, b) => b - a)); // biggest first
// unfiltered:
expect(result.current.data?.categoryTransactions).toEqual([]);
expect(result.current.data?.categoryNotes).toEqual([]);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- use-analytics`
Expected: FAIL — fields don't exist.

- [ ] **Step 3: Implement in `use-analytics.ts`**

Add imports:
```ts
import { topTransactions } from './top-transactions';
// topNotes + NoteRow are already imported for the app-wide TopNotesList.
```
Add to `AnalyticsData`:
```ts
  // The active cycle's biggest single expenses and note rollup, scoped to the filtered category.
  // Empty when unfiltered (the app-wide TopNotesList covers that). Active cycle only — see the spec's
  // window-scoping ceiling; the panel subtitle states this.
  categoryTransactions: EntryRow[];
  categoryNotes: NoteRow[];
```
(`EntryRow` — add to the existing `./queries` type import if not already imported; it is exported from `./schema`. Use whichever the file already imports rows as.)

Derive after `cycleEntries` is fetched:
```ts
      const inCategory = category === null ? [] : cycleEntries.filter((e) => e.category === category);
      const categoryTransactions = topTransactions(inCategory);
      const categoryNotes = category === null ? [] : topNotes(inCategory);
```
Add both to `setData`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- use-analytics`
Expected: PASS.

- [ ] **Step 5: Render in the filtered branch + restrict the supporting block**

In `src/app/analytics/page.tsx`:

1. Add `categoryTransactions`, `categoryNotes` to the destructured `data`; import `TopTransactionsList`:
```tsx
import { TopTransactionsList } from '@features/entries/ui/TopTransactionsList';
```
2. In the filtered category panel's subtitle (`subtitle` is currently the window range) — leave the trend subtitle as-is, but the two new lists carry their own "this cycle" headings (`TopTransactionsList` says "Top transactions", `TopNotesList` says "Top notes this cycle" via aria). To prevent misreading the active-cycle lists as windowed, they render only in the filtered branch, directly below the `CycleDeltaCard`.
3. After the `{delta !== null ? <CycleDeltaCard .../> : null}` line, add:
```tsx
      {category !== null ? (
        <>
          <TopTransactionsList
            entries={categoryTransactions}
            emojiMap={emojiMap}
            hueMap={hueMap}
            iconSet={iconSet}
            cycleKey={activeKey}
          />
          <TopNotesList notes={categoryNotes} />
        </>
      ) : null}
```
4. Restrict the existing app-wide supporting block (heatmap + top-notes) to the unfiltered view — replace:
```tsx
      <div className="flex flex-col gap-3">
        <SpendHeatmap cells={heatmapCells} />
        <TopNotesList notes={topNotes} />
      </div>
```
with:
```tsx
      {category === null ? (
        <div className="flex flex-col gap-3">
          <SpendHeatmap cells={heatmapCells} />
          <TopNotesList notes={topNotes} />
        </div>
      ) : null}
```
(This removes today's oddity of showing an app-wide heatmap + app-wide notes beneath a single-category view; the filtered view now gets its own scoped notes instead.)

- [ ] **Step 6: Verify gates + browser**

Run: `npm run typecheck && npm run lint && npm test`
Open `/analytics?category=<busy category>` at 412px; confirm biggest transactions (tap → edit entry) and a note rollup scoped to that category appear, and the app-wide heatmap/top-notes are gone in the filtered view. Confirm unfiltered still shows the heatmap + app-wide notes and NO category lists.

- [ ] **Step 7: Format + commit**

```bash
npm run format:files src/features/entries/use-analytics.ts src/app/analytics/page.tsx src/features/entries/use-analytics.test.ts
git add -A
git commit -m "feat(entries): scope biggest-tx and note rollup to the filtered category" -m "Feed category-filtered active-cycle entries to the existing topTransactions/topNotes helpers; render TopTransactionsList + TopNotesList in the filtered branch and restrict the app-wide heatmap/notes block to the unfiltered view."
```

---

## Task 5: `byWeekday` — day-of-week spending aggregation

**Files:**
- Create: `src/features/entries/by-weekday.ts`
- Test: `src/features/entries/by-weekday.test.ts`

**Interfaces:**
- Consumes: `EntryRow` from `./schema` (`date: 'YYYY-MM-DD'`, `amount` signed).
- Produces:
  - `type WeekdayRow = { day: string; total: number; count: number }` (`day` ∈ `'Mon'..'Sun'`)
  - `type WeekdayStats = { rows: WeekdayRow[]; peak: WeekdayRow | null; weekendRatio: number | null; totalCount: number }`
  - `function byWeekday(entries: EntryRow[]): WeekdayStats`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { byWeekday } from './by-weekday';
import type { EntryRow } from './schema';

// Minimal EntryRow factory — only the fields byWeekday reads matter.
function e(date: string, amount: number): EntryRow {
  return {
    id: 1, date, time: null, accountId: 1, categoryId: 1, amount, currency: null,
    originalAmount: null, note: null, source: 'manual', offBudget: null,
    category: 'Food', account: 'Cash',
  };
}

describe('byWeekday', () => {
  // 2026-07-24 is a Friday; 2026-07-25 Saturday; 2026-07-26 Sunday; 2026-07-27 Monday (UTC).
  it('buckets magnitudes by UTC weekday, Mon..Sun order', () => {
    const stats = byWeekday([e('2026-07-27', -100), e('2026-07-24', -300), e('2026-07-24', -50)]);
    expect(stats.rows.map((r) => r.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(stats.rows.find((r) => r.day === 'Fri')).toEqual({ day: 'Fri', total: 350, count: 2 });
    expect(stats.rows.find((r) => r.day === 'Mon')).toEqual({ day: 'Mon', total: 100, count: 1 });
    expect(stats.totalCount).toBe(3);
  });

  it('names the peak day', () => {
    const stats = byWeekday([e('2026-07-24', -300), e('2026-07-27', -100)]);
    expect(stats.peak?.day).toBe('Fri');
  });

  it('has no peak and null ratio when empty', () => {
    const stats = byWeekday([]);
    expect(stats.peak).toBeNull();
    expect(stats.weekendRatio).toBeNull();
    expect(stats.totalCount).toBe(0);
  });

  it('computes weekend-vs-weekday ratio from per-slot averages (weekend/5 vs weekday/2 slots)', () => {
    // Weekday total 500 over 5 slots = 100/slot; weekend total 400 over 2 slots = 200/slot → 2.0
    const stats = byWeekday([e('2026-07-24', -500), e('2026-07-25', -400)]); // Fri weekday, Sat weekend
    expect(stats.weekendRatio).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- by-weekday`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/features/entries/by-weekday.ts
import type { EntryRow } from './schema';

// "When in the week does the money go" — the active cycle's spend bucketed by day of week. The
// heatmap shows WHICH dates; this shows the WEEKLY RHYTHM (peak day, weekend vs weekday). Magnitudes
// (ledger stores outflows negative). Weekday comes from the UTC date key via Intl — the date keys are
// UTC-stable, so no timezone drift and no string slicing.
export type WeekdayRow = { day: string; total: number; count: number };
export type WeekdayStats = {
  rows: WeekdayRow[]; // always 7, Mon..Sun
  peak: WeekdayRow | null; // highest total; null when no spend
  // Per-slot average ratio: (weekend total / 2) / (weekday total / 5). > 1 = weekends spend heavier.
  // null when there is no weekday spend to divide by. ponytail: slot-count normalisation (2 vs 5),
  // not true per-day-occurrence average — a glance heuristic; upgrade to date-occurrence counting if
  // it ever misleads.
  weekendRatio: number | null;
  totalCount: number; // entry count, for the card to soften copy on a thin sample
};

const ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKEND = new Set(['Sat', 'Sun']);
const fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

export function byWeekday(entries: EntryRow[]): WeekdayStats {
  const totals = new Map<string, { total: number; count: number }>();
  for (const day of ORDER) totals.set(day, { total: 0, count: 0 });

  for (const entry of entries) {
    const day = fmt.format(new Date(`${entry.date}T00:00:00Z`));
    const cell = totals.get(day);
    if (cell === undefined) continue; // defensive; Intl 'short' en-US yields exactly ORDER
    cell.total += Math.abs(entry.amount);
    cell.count += 1;
  }

  const rows: WeekdayRow[] = ORDER.map((day) => {
    const cell = totals.get(day) ?? { total: 0, count: 0 };
    return { day, total: cell.total, count: cell.count };
  });

  const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
  const peak =
    totalCount === 0 ? null : rows.reduce((best, r) => (r.total > best.total ? r : best), rows[0]);

  const weekdayTotal = rows.filter((r) => !WEEKEND.has(r.day)).reduce((s, r) => s + r.total, 0);
  const weekendTotal = rows.filter((r) => WEEKEND.has(r.day)).reduce((s, r) => s + r.total, 0);
  const weekendRatio = weekdayTotal === 0 ? null : weekendTotal / 2 / (weekdayTotal / 5);

  return { rows, peak, weekendRatio, totalCount };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- by-weekday`
Expected: PASS (4 tests).

- [ ] **Step 5: Format, gates, commit**

```bash
npm run format:files src/features/entries/by-weekday.ts src/features/entries/by-weekday.test.ts
npm run typecheck && npm run lint
git add src/features/entries/by-weekday.ts src/features/entries/by-weekday.test.ts
git commit -m "feat(entries): byWeekday — day-of-week spending aggregation" -m "Pure fn: UTC-weekday buckets (Mon..Sun) with peak day and a slot-normalised weekend/weekday ratio; magnitudes, thin-sample count exposed for copy softening."
```

---

## Task 6: `WeekdayCard` + wire into Trends (unfiltered)

**Files:**
- Create: `src/features/entries/ui/WeekdayCard.tsx`
- Test: `src/features/entries/ui/WeekdayCard.test.tsx`
- Modify: `src/features/entries/use-analytics.ts`
- Modify: `src/app/analytics/page.tsx`

**Interfaces:**
- Consumes: `WeekdayStats` from Task 5, `formatBahtWhole`.
- Produces: `AnalyticsData.weekday: WeekdayStats`; `WeekdayCard` accepts `{ stats: WeekdayStats }`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WeekdayCard } from './WeekdayCard';
import type { WeekdayStats } from '../by-weekday';

const stats = (over: Partial<WeekdayStats> = {}): WeekdayStats => ({
  rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({ day, total: 0, count: 0 })),
  peak: null,
  weekendRatio: null,
  totalCount: 0,
  ...over,
});

describe('WeekdayCard', () => {
  it('renders nothing when there is no spend', () => {
    const { container } = render(<WeekdayCard stats={stats()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the peak day when there is enough data', () => {
    render(
      <WeekdayCard
        stats={stats({
          rows: [
            { day: 'Mon', total: 100, count: 1 }, { day: 'Tue', total: 0, count: 0 },
            { day: 'Wed', total: 0, count: 0 }, { day: 'Thu', total: 0, count: 0 },
            { day: 'Fri', total: 500, count: 3 }, { day: 'Sat', total: 200, count: 2 },
            { day: 'Sun', total: 0, count: 0 },
          ],
          peak: { day: 'Fri', total: 500, count: 3 },
          weekendRatio: 1.8,
          totalCount: 6,
        })}
      />,
    );
    expect(screen.getByText(/Fri/)).toBeInTheDocument();
  });

  it('softens the copy on a thin sample instead of asserting a pattern', () => {
    render(<WeekdayCard stats={stats({ peak: { day: 'Mon', total: 50, count: 1 }, totalCount: 1 })} />);
    expect(screen.getByText(/not enough/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- WeekdayCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `WeekdayCard`**

```tsx
import type { WeekdayStats } from '../by-weekday';
import { formatBahtWhole } from '@shared/money';

// Below this many entries a "pattern" is noise — say so rather than crown a peak day off one receipt
// (the same honesty the trend subtitle applies to thin history).
const MIN_FOR_PATTERN = 5;

// The active cycle's weekly rhythm (see byWeekday): a compact seven-row bar list plus a one-line
// takeaway. Bars are relative to the busiest day. Renders nothing on an empty cycle.
export function WeekdayCard({ stats }: { stats: WeekdayStats }) {
  if (stats.totalCount === 0 || stats.peak === null) return null;
  const max = Math.max(...stats.rows.map((r) => r.total), 1);
  const thin = stats.totalCount < MIN_FOR_PATTERN;
  const takeaway = thin
    ? 'Not enough spending yet to call a weekly pattern'
    : stats.weekendRatio !== null && stats.weekendRatio >= 1.2
      ? `${stats.peak.day} is your peak · weekends run ${stats.weekendRatio.toFixed(1)}× weekdays`
      : stats.weekendRatio !== null && stats.weekendRatio <= 0.8
        ? `${stats.peak.day} is your peak · weekdays run heavier than weekends`
        : `${stats.peak.day} is your peak spending day`;

  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Spending by day of week">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        By day of week
      </h2>
      <ul className="flex flex-col gap-2">
        {stats.rows.map((r) => (
          <li key={r.day} className="flex items-center gap-3 text-sm">
            <span className="w-9 shrink-0" style={{ color: 'var(--color-muted)' }}>
              {r.day}
            </span>
            <span className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--color-faint)' }}>
              <span
                className="h-full rounded-full"
                style={{ width: `${(r.total / max) * 100}%`, background: 'var(--color-accent)' }}
              />
            </span>
            <span className="tnum w-16 shrink-0 text-right" style={{ color: 'var(--color-text)' }}>
              {formatBahtWhole(r.total)}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {takeaway}
      </span>
    </section>
  );
}
```

Note: confirm `--color-accent` / `--color-faint` token names against `globals.css` before finalising; substitute the actual bar-fill and hairline tokens the app uses (the delta card and heatmap are good references).

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- WeekdayCard`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `use-analytics`**

Add import:
```ts
import { byWeekday, type WeekdayStats } from './by-weekday';
```
Add to `AnalyticsData`:
```ts
  // The active cycle's day-of-week rhythm — app-wide (unfiltered) supporting card.
  weekday: WeekdayStats;
```
Derive from the already-fetched active-cycle entries:
```ts
      const weekday = byWeekday(cycleEntries);
```
Add `weekday` to `setData`.

- [ ] **Step 6: Render on the page (unfiltered supporting block)**

In `analytics/page.tsx`, add `weekday` to the destructured `data`, import `WeekdayCard`, and place it inside the `category === null` supporting block from Task 4:
```tsx
      {category === null ? (
        <div className="flex flex-col gap-3">
          <SpendHeatmap cells={heatmapCells} />
          <WeekdayCard stats={weekday} />
          <TopNotesList notes={topNotes} />
        </div>
      ) : null}
```

- [ ] **Step 7: Verify gates + browser**

Run: `npm run typecheck && npm run lint && npm test`
Open `/analytics` at 412px unfiltered; confirm the By-day-of-week card renders with seven bars + a takeaway, and does NOT appear in a filtered category view. Seed a thin cycle (1 entry) and confirm the softened copy.

- [ ] **Step 8: Format + commit**

```bash
npm run format:files src/features/entries/ui/WeekdayCard.tsx src/features/entries/ui/WeekdayCard.test.tsx src/features/entries/use-analytics.ts src/app/analytics/page.tsx
git add -A
git commit -m "feat(entries): day-of-week spending card on Trends" -m "WeekdayCard renders byWeekday's seven-bar rhythm + a peak/weekend takeaway, softening copy on a thin sample; wired unfiltered into the Trends supporting block."
```

---

## Task 7: Final verification

- [ ] **Step 1: Full gate run**

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```
Expected: all green.

- [ ] **Step 2: Browser walkthrough at 412px**

- Unfiltered `/analytics`: delta card shows total **and** top movers; supporting block shows heatmap + weekday card + app-wide notes.
- Filtered `/analytics?category=…`: category trend + per-cycle list + budget line (unchanged), a per-category "vs last cycle" card (no movers), category-scoped biggest transactions and notes; NO heatmap/weekday/app-wide notes.
- Empty ledger: `EmptyLedger` still renders (unchanged); no crashes.
- Day-one / thin cycle: no "vs last" card (null), weekday card shows softened copy.

- [ ] **Step 3: Merge the branch** per `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage:**
- Addition 1 "what changed" → Tasks 1–2. ✓
- Addition 2 per-category delta → Task 3; biggest-tx + notes → Task 4. ✓
- Addition 3 day-of-week → Tasks 5–6. ✓
- Non-goals (no new column/route/rollup rebuild) → Global Constraints + reuse of existing helpers. ✓
- Window-scoping ceiling stated in UI → Task 4 Step 5 (lists live only in filtered branch) + `byWeekday`/`WeekdayCard` thin-sample copy. ✓

**Type consistency:** `DeltaContributor` (Task 1) used verbatim in Task 2. Matrix cell type identical across Tasks 1–2 and the Global Constraints. `WeekdayStats`/`WeekdayRow` (Task 5) used verbatim in Task 6. `categoryTransactions: EntryRow[]` / `categoryNotes: NoteRow[]` (Task 4) match `TopTransactionsList` (`entries: EntryRow[]`) and `TopNotesList` (`notes: NoteRow[]`) props. ✓

**Open confirmations for the implementer (not blockers):** exact CSS token names (`--color-line` vs `--color-faint`, `--color-accent`) — verify against `globals.css` and match the delta card / heatmap references; the `use-analytics.test.ts` seeding helper — reuse the file's existing harness rather than inventing one.
