# Off-Budget Spend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let irregular expenses be marked "off-budget" (a category-level default + a per-entry tri-state override) so the budget meter, pace phrase, safe-to-spend, and per-category meters compute on *discretionary* spend — while the ledger, donut, records, top-transactions, and trend stay all-in. Drop the Projected card.

**Architecture:** Two new columns (`categories.off_budget`, `entries.off_budget`) with the effective rule `entry.off_budget ?? category.off_budget ?? 0`. A pure `off-budget.ts` module splits a cycle's entries into discretionary vs off-budget totals; `useHome` and the Budgets hook feed the discretionary figure to the existing `toBudgetTotal`/`toBudgetRows`. Toggles on the entry form and Categories page set the flags.

**Tech Stack:** Next.js 16 App Router (static export, `'use client'`), React 19, TS 5.9 strict, Tailwind v4, Vitest + `@testing-library/react` (`renderHook`), SQLite-wasm/OPFS with a better-sqlite3 node-proxy shim for tests.

## Global Constraints

- **Offline / no server / single-user / spending-only** (outflows; magnitudes via `Math.abs`).
- **TS bans (ESLint errors):** no `any`/`as`/`!`/`// @ts-*`; `type` over `interface`; `for..of`.
- **Money:** `formatBahtWhole` for computed glance figures, `formatBaht` for stored amounts; THB; `tnum`.
- **Reads async, post-mount**, `{ ready, data }`; `?cycle=` anchors; refetch via `useDataVersion`.
- **Schema in two places:** any column goes in the feature `schema.ts` `ensure*Table` **and** `src/db/worker.ts` `BOOTSTRAP_SQL`. The schema-lockstep test introspects PRAGMA and auto-covers entries/categories (already in its `TABLES`) — no test edit, but it FAILS if the two definitions drift, so they must match exactly (column name, type, NOT NULL, DEFAULT).
- **Effective off-budget rule (single source of truth):** `(entry.off_budget ?? (category.off_budget ? 1 : 0)) === 1`.
- **Scope — discretionary (excludes off-budget):** Home budget meter + its "Spent this cycle" figure, pace phrase, safe-to-spend/day, and the Budgets-page per-category meters. **All-in (unchanged):** ledger, Records, Home donut/breakdown, Top transactions, Trends/analytics, anomaly. **Dropped:** Projected card.
- **Quality gates before each commit** (run separately): `npm run format:files <files>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`.
- **Commit** `type(scope): subject` + repeated `-m`; scopes `db`, `features`, `app`; no `Claude-Session:` trailer.
- **Environment:** Git Bash (POSIX), not PowerShell. `git diff` bodies are stripped by a compressor — read changed files with the Read tool. Empty grep ≠ absence. Layout is browser-verified (deferred to one consolidated pass), not unit-tested.
- **Backup ceiling (documented, not a bug):** the flags live in OPFS and are lost only on a Monefy-CSV restore (no column). Add a `ponytail:` comment where the flag is defined.

---

### Task 1: Schema — `off_budget` columns + types + read/write plumbing

**Files:**
- Modify: `src/features/categories/schema.ts`, `src/features/entries/schema.ts`, `src/db/worker.ts`, `src/features/entries/queries.ts`
- Test: `src/features/entries/queries.test.ts` (or the existing entries-query test file — match what's there)

**Interfaces:**
- Produces: `Category.offBudget: number` (0/1); `Entry.offBudget: number | null`; `EntryRow.offBudget: number | null`; `EntryInput.offBudget?: number | null`. `addEntries` persists `off_budget`; `EntryRow` SELECT projects `off_budget`.

- [ ] **Step 1: Add the columns to both definitions**

`src/features/categories/schema.ts` — add to the drizzle table (after `archived`): `offBudget: integer('off_budget').notNull().default(0),` and to `ensureCategoriesTable`'s CREATE add `off_budget INTEGER NOT NULL DEFAULT 0`. Add a `ponytail:` note: `// off_budget: 1 = this category's spend is excluded from budget meters/pace (see off-budget.ts). ponytail: lives in OPFS; lost on Monefy-CSV restore (format has no column) — upgrade path is a native backup carrying category meta.`

`src/features/entries/schema.ts` — add to the drizzle table (after `source`): `offBudget: integer('off_budget'),` (nullable, tri-state), and to `ensureEntriesTable`'s CREATE add `off_budget INTEGER`. Add `EntryInput.offBudget?: number | null;`. Note: `// off_budget: null = inherit the category, 0 = force include, 1 = force exclude.`

`src/db/worker.ts` — in `BOOTSTRAP_SQL`, edit the entries CREATE to append `, off_budget INTEGER` before the closing `)`, and the categories CREATE to append `, off_budget INTEGER NOT NULL DEFAULT 0` before its closing `)`. (Match the schema.ts column name/type/default EXACTLY or the lockstep test fails.)

- [ ] **Step 2: Run the lockstep test — expect it to PASS (proves no drift)**

Run: `npm test -- schema-lockstep`
Expected: PASS. If it FAILS on entries/categories columns, the two DDLs disagree — reconcile them.

- [ ] **Step 3: Write a failing round-trip test**

Read the existing entries query test file to match its harness. Add a test: insert an entry with `offBudget: 1` via `addEntries`, read it back via `getEntriesInRange`, assert the read row has `offBudget === 1`; insert one without the field, assert it reads back `offBudget === null`.

Run it → FAIL (addEntries drops the field / SELECT doesn't project it).

- [ ] **Step 4: Plumb read + write**

In `src/features/entries/queries.ts`:
- `addEntries` (around line 71): include `off_budget` in the inserted row, value `row.offBudget ?? null`. (Read the current insert mapping and add the field alongside `source`.)
- The `EntryRow` SELECT projection(s) (`getEntriesInRange`, and any other query returning `EntryRow` — `searchEntries`, `getEntriesByCategory`, `getTripEntries`): add `off_budget` to the selected columns so it lands on the row as `offBudget`. (Read how the projection maps columns → EntryRow; follow that pattern. sqlite-proxy maps positionally — keep the column order in sync with the row shape.)
- If entry EDIT goes through an update function in `queries.ts`, add `off_budget` to its SET list too. (If edit is handled in `actions.ts` via a re-insert/replace, note it for Task 7.)

- [ ] **Step 5: Run tests + gate**

Run: `npm test -- schema-lockstep queries` → PASS. Then full gates.

- [ ] **Step 6: Commit**

```bash
git add src/features/categories/schema.ts src/features/entries/schema.ts src/db/worker.ts src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(db): add off_budget columns to categories and entries" -m "categories.off_budget (0/1 default) is the category-level default; entries.off_budget (nullable tri-state: null=inherit, 0=include, 1=exclude) is the per-entry override. Added in schema.ts + worker.ts BOOTSTRAP_SQL (lockstep green); addEntries writes it and EntryRow projects it."
```

---

### Task 2: Category off-budget query + setter

**Files:**
- Modify: `src/features/categories/queries.ts`
- Test: the categories query test file (match what's there)

**Interfaces:**
- Consumes: `Category.offBudget` (Task 1).
- Produces: `getOffBudgetCategories(db: Db): Promise<Set<string>>` (names where `off_budget = 1`); `setCategoryOffBudget(db: Db, category: string, offBudget: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Read the existing test for `getEmojiMap`/`setCategoryHue` to match the harness. Add: seed two categories, `setCategoryOffBudget(db, 'Insurance', true)`, assert `getOffBudgetCategories(db)` returns a `Set` containing `'Insurance'` and not the other; then `setCategoryOffBudget(db, 'Insurance', false)` and assert it's gone.

Run → FAIL (functions undefined).

- [ ] **Step 2: Implement (mirror `getEmojiMap` at line ~166 and `setCategoryHue` at line ~214)**

Add to `src/features/categories/queries.ts`:

```ts
// The set of category NAMES flagged off-budget — loaded like getEmojiMap/getHueMap and used by
// off-budget.ts to decide which spend the budget meters ignore.
export async function getOffBudgetCategories(db: Db): Promise<Set<string>> {
  const rows = await db.select({ name: categories.name }).from(categories).where(eq(categories.offBudget, 1));
  return new Set(rows.map((r) => r.name));
}

// Toggle a category's off-budget default. Mirrors setCategoryHue's update-by-name shape.
export async function setCategoryOffBudget(db: Db, category: string, offBudget: boolean): Promise<void> {
  await db.update(categories).set({ offBudget: offBudget ? 1 : 0 }).where(eq(categories.name, category));
}
```

(Confirm `eq`/`categories` are already imported in the file; add if needed. Match the actual query-builder style used by the siblings.)

- [ ] **Step 3: Run test + gate + commit**

```bash
npm test -- categories
# gates
git add src/features/categories/queries.ts <test file>
git commit -m "feat(features): add category off-budget query + setter" -m "getOffBudgetCategories returns the flagged category names (loaded like the emoji/hue maps); setCategoryOffBudget toggles the default. Backs the off-budget spend math and the Categories-page toggle."
```

---

### Task 3: `off-budget.ts` pure module

**Files:**
- Create: `src/features/entries/off-budget.ts`
- Test: `src/features/entries/off-budget.test.ts`

**Interfaces:**
- Consumes: `EntryRow` (with `offBudget: number | null`, `category: string`, `amount: number`).
- Produces: `isOffBudget(entry, offBudgetCategories)`, `splitBudgetSpend(entries, offBudgetCategories) → { discretionary, offBudget }`, `discretionaryByCategory(entries, offBudgetCategories) → Map<string, number>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isOffBudget, splitBudgetSpend, discretionaryByCategory } from './off-budget';
import type { EntryRow } from './schema';

function row(amount: number, category: string, offBudget: number | null): EntryRow {
  return { id: 1, date: '2026-07-20', time: null, accountId: 1, categoryId: 1, amount, currency: null,
    originalAmount: null, note: null, source: 'manual', offBudget, category, account: 'Cash' };
}

describe('off-budget rules', () => {
  const cats = new Set(['Insurance']);
  it('isOffBudget: entry override wins over category default (both directions)', () => {
    expect(isOffBudget(row(-1, 'Food', null), cats)).toBe(false);      // inherit, not off-budget cat
    expect(isOffBudget(row(-1, 'Insurance', null), cats)).toBe(true);  // inherit off-budget cat
    expect(isOffBudget(row(-1, 'Insurance', 0), cats)).toBe(false);    // force include overrides cat
    expect(isOffBudget(row(-1, 'Food', 1), cats)).toBe(true);          // force exclude in a normal cat
  });
  it('splitBudgetSpend returns magnitudes for discretionary vs off-budget', () => {
    const entries = [row(-600, 'Food', null), row(-12000, 'Insurance', null), row(-50, 'Food', 1)];
    expect(splitBudgetSpend(entries, cats)).toEqual({ discretionary: 600, offBudget: 12050 });
  });
  it('discretionaryByCategory sums only non-off-budget entries, by category', () => {
    const entries = [row(-600, 'Food', null), row(-12000, 'Insurance', null), row(-50, 'Food', 1)];
    const m = discretionaryByCategory(entries, cats);
    expect(m.get('Food')).toBe(600); // the -50 forced-exclude is dropped
    expect(m.has('Insurance')).toBe(false);
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
import type { EntryRow } from './schema';

// The single source of truth for "does this entry count against the budget?" Per-entry off_budget wins
// (null = inherit the category default). See the off-budget spend spec.
export function isOffBudget(entry: EntryRow, offBudgetCategories: Set<string>): boolean {
  const effective = entry.offBudget ?? (offBudgetCategories.has(entry.category) ? 1 : 0);
  return effective === 1;
}

// Split a cycle's entries into discretionary vs off-budget spend magnitudes (the ledger stores outflows
// negative; both are returned positive). Feeds the budget meter/pace/safe-to-spend and the Home disclose line.
export function splitBudgetSpend(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
): { discretionary: number; offBudget: number } {
  let discretionary = 0;
  let offBudget = 0;
  for (const e of entries) {
    const mag = Math.abs(e.amount);
    if (isOffBudget(e, offBudgetCategories)) offBudget += mag;
    else discretionary += mag;
  }
  return { discretionary, offBudget };
}

// Per-category discretionary spend (off-budget entries dropped) — the Budgets page feeds this to
// toBudgetRows so per-category meters match the Home total meter.
export function discretionaryByCategory(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const e of entries) {
    if (isOffBudget(e, offBudgetCategories)) continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + Math.abs(e.amount));
  }
  return byCat;
}
```

- [ ] **Step 3: Run test + gate + commit**

```bash
npm test -- off-budget
# gates
git add src/features/entries/off-budget.ts src/features/entries/off-budget.test.ts
git commit -m "feat(features): add off-budget spend split (pure)" -m "isOffBudget (entry override ?? category default), splitBudgetSpend (discretionary vs off-budget magnitudes), discretionaryByCategory. The single source of truth for what counts against the budget."
```

---

### Task 4: `useHome` — discretionary budget math, drop projected

**Files:**
- Modify: `src/features/entries/use-home.ts`
- Test: `src/features/entries/use-home.test.ts`

**Interfaces:**
- Consumes: `splitBudgetSpend` (Task 3); `getOffBudgetCategories` (Task 2); `HomeData.forward` (existing); the already-fetched `cycleEntries`.
- Produces: `HomeData.offBudgetTotal: number`; `totalStatus`, `pacePct`, and `forward.safePerDay`/`avgPerDay` now computed on discretionary spend; `forward.projected` REMOVED. `total` (donut) stays all-in.

- [ ] **Step 1: Write the failing test**

Add to `use-home.test.ts` (harness already seeds + mocks `todayIso`; add `setBudget` + `setCategoryOffBudget` imports). Seed the current cycle with a normal entry and an off-budget one (via a category flagged off-budget or an entry with `offBudget:1`), set a total budget, then assert: `data.offBudgetTotal` equals the excluded magnitude; `data.totalStatus.spent` equals only the discretionary magnitude (NOT the all-in total); and `data.forward` has no `projected` (or it's absent from the type). Also assert `data.total` (donut) is still the ALL-IN sum.

Run → FAIL.

- [ ] **Step 2: Implement**

In `src/features/entries/use-home.ts`:
- Import `splitBudgetSpend` from `./off-budget` and `getOffBudgetCategories` from `@features/categories/queries`; add `getOffBudgetCategories(db)` to the effect's `Promise.all`.
- After `cycleEntries` is available, compute `const { discretionary, offBudget } = splitBudgetSpend(cycleEntries, offBudgetCategories);`.
- Feed **discretionary** where the budget math currently uses `total`: `totalStatus = totalLimit === null ? null : toBudgetTotal(totalLimit, discretionary)`; the forward `safePerDay`/`avgPerDay` use `discretionary` for spent; `pacePct` is time-based (unchanged) but the pace PHRASE reads `totalStatus.pct` so it becomes discretionary automatically.
- Keep `total` (the donut sum) all-in — do NOT change it.
- Add `offBudgetTotal: offBudget` to `HomeData` + `setData`.
- Remove `projected` from the `HomeForward` type and from the `forward` object (drop the `projectCycleTotal` call + its import if now unused).

- [ ] **Step 3: Run test (PASS) + gate + commit**

```bash
npm test -- use-home
# gates
git add src/features/entries/use-home.ts src/features/entries/use-home.test.ts
git commit -m "feat(features): compute Home budget math on discretionary spend" -m "useHome loads the off-budget category set, splits the cycle into discretionary vs off-budget, and feeds discretionary to the budget meter + safe-to-spend + pace; exposes offBudgetTotal; drops projected. The donut total stays all-in."
```

---

### Task 5: Home UI — discretionary headline + disclose line, remove ProjectedCard

**Files:**
- Modify: `src/app/page.tsx`, `src/features/entries/ui/ForwardCards.tsx`

**Interfaces:**
- Consumes: `HomeData.offBudgetTotal`, `totalStatus` (discretionary), `forward` (no `projected`).

- [ ] **Step 1: Remove ProjectedCard**

In `src/features/entries/ui/ForwardCards.tsx`, delete the `ProjectedCard` component and its export. Keep `SafeToSpendCard` (+ `CardShell`/`UpcomingLine`).

- [ ] **Step 2: Update Home render**

In `src/app/page.tsx`:
- Remove the `ProjectedCard` import and its render (the forward block now renders only `SafeToSpendCard`).
- Destructure `offBudgetTotal`.
- The "Spent this cycle ฿X of ฿Y" figure already reads `total`/`totalStatus` — change the spent figure it shows to the discretionary spend (`totalStatus.spent` when a budget exists) so it matches the meter. (Read the current headline block; the figure must equal the meter's numerator. If no budget is set, show discretionary spend too.)
- Add a muted disclose line directly under the headline, shown only when `offBudgetTotal > 0`:

```tsx
{offBudgetTotal > 0 ? (
  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
    + {formatBahtWhole(offBudgetTotal)} off-budget
  </span>
) : null}
```

- [ ] **Step 3: Gate + commit**

```bash
npm run format:files src/app/page.tsx src/features/entries/ui/ForwardCards.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/page.tsx src/features/entries/ui/ForwardCards.tsx
git commit -m "feat(app): show discretionary spend + off-budget disclosure on Home, drop Projected" -m "The headline figure + meter now read discretionary; a muted '+ ฿X off-budget' line appears when the cycle has off-budget spend. ProjectedCard removed."
```

> Browser check (deferred, consolidated): a cycle with an off-budget entry shows the calm discretionary headline + meter, the "+ ฿X off-budget" line, the all-in donut below, and no Projected card.

---

### Task 6: Budgets page — per-category meters on discretionary spend

**Files:**
- Modify: the Budgets page hook (`src/features/budgets/use-budgets.ts` or wherever `toBudgetRows` is fed — Read to confirm)
- Test: that hook's test

**Interfaces:**
- Consumes: `discretionaryByCategory` (Task 3), `getOffBudgetCategories` (Task 2).
- Produces: the Budgets page's `spentByCategory` is discretionary (off-budget entries dropped).

- [ ] **Step 1: Read the budgets hook** to see how it currently builds `spentByCategory` (likely from `getCategoryBreakdown`). Write a failing test: seed a budgeted category with a normal entry + an off-budget entry (per-entry `offBudget:1` or an off-budget category), assert the category's row `spent` counts only the discretionary magnitude.

- [ ] **Step 2: Implement** — fetch the cycle's entries + `getOffBudgetCategories`, build `spentByCategory` via `discretionaryByCategory(entries, offBudgetCategories)` instead of the all-in breakdown. Feed it to the existing `toBudgetRows`. (If the hook currently uses `getCategoryBreakdown`, switch that source to the discretionary map; everything downstream is unchanged.)

- [ ] **Step 3: Run test (PASS) + gate + commit**

```bash
git add <budgets hook + test>
git commit -m "feat(features): budgets page meters use discretionary spend" -m "Per-category meters drop off-budget entries (via discretionaryByCategory), so they match the Home total meter's discretionary basis."
```

---

### Task 7: Entry form — "Exclude from budget" toggle

**Files:**
- Modify: `src/features/entries/ui/EntryForm.tsx`, and the write path (`src/features/entries/actions.ts` and/or the entry update query) so `offBudget` is saved on create AND edit.

**Interfaces:**
- Consumes: `EntryInput.offBudget` (Task 1); `getOffBudgetCategories` (Task 2) to show the effective default; `isOffBudget`/category set for the initial state.

- [ ] **Step 1: Read `EntryForm.tsx`** and the create/edit actions to see how fields flow from form → `EntryInput` → db. Note where the selected category is known (the toggle's default depends on it).

- [ ] **Step 2: Add the toggle.** A labeled switch "Exclude from budget (one-off)". Its checked state defaults to the *effective* value — the selected category's off-budget default (look it up from the off-budget category set) unless the entry already has an explicit `offBudget`. When the user flips it, set the entry's `offBudget` to `1`/`0` (an explicit override). On edit, initialize from the entry's stored `offBudget` (null → show the category default). Pass `offBudget` through the action into `EntryInput`.

> Keep it simple: a 2-state checkbox backing the tri-state — untouched entries store `null` (inherit); once toggled it stores explicit `0`/`1`. No separate "revert to inherit" control in v1.

- [ ] **Step 3: Ensure the edit path persists `offBudget`** (if edit re-inserts via `addEntries`/replace, it already carries it from Task 1; if it uses a dedicated update, add `off_budget` to that SET — Task 1 Step 4 covers the query, this wires the form value in).

- [ ] **Step 4: Gate + commit**

```bash
git add src/features/entries/ui/EntryForm.tsx src/features/entries/actions.ts
git commit -m "feat(app): add an exclude-from-budget toggle to the entry form" -m "A one-off toggle on new/edit entries writes the per-entry off_budget override (default inherits the category); persisted on create and edit."
```

> Browser check (deferred, consolidated): toggling it on a new big entry excludes it from the Home meter; editing an entry reflects/persists the flag.

---

### Task 8: Categories page — per-category off-budget toggle

**Files:**
- Modify: `src/app/categories/page.tsx` (and its hook/actions if writes go through one)

**Interfaces:**
- Consumes: `setCategoryOffBudget` (Task 2); `Category.offBudget`.

- [ ] **Step 1: Read `src/app/categories/page.tsx`** to see how a per-category meta control (emoji/hue) is rendered + saved (it calls `setCategoryEmoji`/`setCategoryHue` and bumps the data version).

- [ ] **Step 2: Add an "off-budget" toggle per category row**, mirroring the emoji/hue controls: reflects `category.offBudget`, calls `setCategoryOffBudget(db, name, checked)` on change (through the same action pattern), and `bumpDataVersion()` so meters refetch. Label it clearly (e.g. "Off-budget" with a one-line hint that its spend won't count toward budgets/pace).

- [ ] **Step 3: Gate + commit**

```bash
git add src/app/categories/page.tsx <any hook/action touched>
git commit -m "feat(app): add a per-category off-budget toggle" -m "Categories can be flagged off-budget (setCategoryOffBudget); their spend is excluded from budget meters/pace by default, per-entry override still wins."
```

> Browser check (deferred, consolidated): flagging a category off-budget drops its spend from the Home + Budgets meters; unflagging restores it.

---

## Self-Review

**Spec coverage:** data model (Task 1), category query/setter (Task 2), effective rule + split (Task 3), Home discretionary math + drop projected (Tasks 4-5), Budgets meters (Task 6), entry toggle (Task 7), category toggle (Task 8). Headline discretionary + disclose (Task 5). Backup ceiling comment (Task 1). ✅

**Placeholder scan:** full code for schema DDL, the pure module, and the category query; the "read the file then wire" steps (write-path projection, budgets hook source, entry form, categories page) name the exact file + exact function/pattern to mirror — integration against live code that must be read, not hand-waves. No TBD.

**Type consistency:** `offBudget` naming is consistent (`Category.offBudget: number`, `Entry/EntryRow.offBudget: number | null`, `EntryInput.offBudget?`); `getOffBudgetCategories → Set<string>` consumed by `splitBudgetSpend`/`discretionaryByCategory` (Task 3) and the hooks (Tasks 4, 6); `setCategoryOffBudget(db, name, boolean)` consumed by Task 8.

## Notes
- Order: Task 1 → 2 → 3 (foundation), then 4-5 (Home), 6 (Budgets), 7-8 (toggles). 6/7/8 are independent of each other.
- No new dependency. Anomaly stays all-in (out of scope). Projected is removed (was added in the reporting redesign; safe to drop — only Home rendered it).
