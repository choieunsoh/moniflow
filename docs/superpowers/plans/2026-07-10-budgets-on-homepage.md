# Budgets on the Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show standing per-category and total budgets on the homepage spending overview (both Chart and List views), reusing the existing budget model.

**Architecture:** Pure wiring — no new logic. `budget-status.ts`'s `toBudgetTotal(limit, spent)` already returns `{ limit, spent, pct, remaining, state }`. Add one pure color-mapping helper, one shared presentational `BudgetMeter` component, thread an optional `limits` map into the existing `Breakdown` list, and read budgets in the home Server Component. With no budgets set, the page is unchanged.

**Tech Stack:** Next.js 16 App Router (Server Components), React 19, TypeScript 5.9 strict (ESM, extensionless relative imports), Tailwind CSS v4 (CSS-var tokens), better-sqlite3 + drizzle-orm, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-10-budgets-on-homepage-design.md`

---

## File Structure

- **Create:** `src/features/budgets/ui/BudgetMeter.tsx` — shared presentational meter (bar + caption), server-renderable.
- **Modify:** `src/features/budgets/budget-status.ts` — add pure `meterColorVar(state)` helper.
- **Modify:** `src/features/budgets/budget-status.test.ts` — add `meterColorVar` unit test.
- **Modify:** `src/features/entries/ui/Breakdown.tsx` — new optional `limits?: Map<string, number>` prop; budgeted rows render a meter, unbudgeted rows unchanged.
- **Modify:** `src/app/page.tsx` — bootstrap + read budgets, split total vs per-category, pass `limits` to `Breakdown`, render total meter under the donut.

**Conventions to follow (already in this repo):**
- No `any` / `as` / `!` / ts-comments. `type` over `interface`. `for..of` over `forEach`.
- Extensionless relative imports (`./budget-status`, not `./budget-status.ts`).
- Colors are CSS-var tokens applied via inline `style={{ ... }}`, e.g. `background: 'var(--color-accent)'` (see `Breakdown.tsx` today).
- Money via `formatBaht` from `@shared/money`.
- Quality gates before each commit (run from repo root, Git Bash / POSIX):
  `npm run format:files <files> && npm run typecheck && npm run lint && npm test`

---

## Task 1: `meterColorVar` color-mapping helper

Maps a `BudgetState` to the CSS var used for the meter fill. Extracted as a pure function so the mapping is unit-tested and `BudgetMeter` stays dumb JSX.

**Files:**
- Modify: `src/features/budgets/budget-status.ts` (append after `toBudgetTotal`, around line 48)
- Test: `src/features/budgets/budget-status.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/features/budgets/budget-status.test.ts`. Update the top import to include `meterColorVar`:

```ts
import { toBudgetRows, toBudgetTotal, suggestBudget, meterColorVar } from './budget-status';
```

Append this describe block at the end of the file:

```ts
describe('meterColorVar', () => {
  it('maps over → loss, near → warn, under/none → accent', () => {
    expect(meterColorVar('over')).toBe('var(--color-loss)');
    expect(meterColorVar('near')).toBe('var(--color-warn)');
    expect(meterColorVar('under')).toBe('var(--color-accent)');
    expect(meterColorVar('none')).toBe('var(--color-accent)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- budget-status`
Expected: FAIL — `meterColorVar is not a function` / no exported member `meterColorVar`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/features/budgets/budget-status.ts` (after `toBudgetTotal`, before `suggestBudget` is fine too — order doesn't matter):

```ts
// The meter fill color for a budget state, as a CSS var (applied via inline style). Only near/over
// deviate from the calm accent — under-budget must not shout, and unbudgeted rows never reach here.
export function meterColorVar(state: BudgetState): string {
  if (state === 'over') return 'var(--color-loss)';
  if (state === 'near') return 'var(--color-warn)';
  return 'var(--color-accent)';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- budget-status`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/budgets/budget-status.ts src/features/budgets/budget-status.test.ts
npm run typecheck && npm run lint && npm test
git add src/features/budgets/budget-status.ts src/features/budgets/budget-status.test.ts
git commit -m "feat(features): add meterColorVar for budget meter fills" -m "Pure BudgetState → CSS-var mapping so the homepage budget meter stays dumb JSX and the color logic is unit-tested. over→loss, near→warn, under/none→accent."
```

---

## Task 2: `BudgetMeter` shared component

A pure, server-renderable presentational component: a progress bar filled to `pct` in the state color, plus a right-aligned caption (`over ฿X` when over, else `NN%`). Renders **only** the bar + caption — callers own the label/number line above it.

**Files:**
- Create: `src/features/budgets/ui/BudgetMeter.tsx`

No standalone test — the only non-trivial logic (color) is covered by Task 1's `meterColorVar` test; the rest is trivial JSX. (Matches the repo's existing `BudgetField.tsx` / `Breakdown.tsx`, which have no component tests.)

- [ ] **Step 1: Create the component**

Create `src/features/budgets/ui/BudgetMeter.tsx`:

```tsx
import { formatBaht } from '@shared/money';
import { meterColorVar, type BudgetTotal } from '../budget-status';

// Shared budget progress meter: a bar filled to `pct` in the state color, with a caption on the
// right — "over ฿600" when past the limit, else the percent used. Renders ONLY the bar + caption;
// the caller renders its own header/label line (category row vs. total) above it. Pure and
// server-renderable — no client state.
export function BudgetMeter({ status }: { status: BudgetTotal }) {
  const caption =
    status.state === 'over'
      ? `over ${formatBaht(Math.abs(status.remaining))}`
      : `${Math.round(status.pct)}%`;
  const fill = meterColorVar(status.state);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 flex-1 overflow-hidden rounded"
        style={{ background: 'var(--color-border)' }}
      >
        <div className="h-full rounded" style={{ width: `${status.pct}%`, background: fill }} />
      </div>
      <span
        className="tnum shrink-0 text-xs"
        style={{ color: status.state === 'over' ? fill : 'var(--color-muted)' }}
      >
        {caption}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: PASS. (`BudgetTotal` is exported from `budget-status.ts` — `type BudgetTotal = Omit<BudgetRow, 'category'>`, shape `{ limit, spent, pct, remaining, state }`.)

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/budgets/ui/BudgetMeter.tsx
npm run typecheck && npm run lint
git add src/features/budgets/ui/BudgetMeter.tsx
git commit -m "feat(features): add shared BudgetMeter progress component" -m "Bar filled to pct in the state color plus an over/percent caption. Reused by the homepage List rows and the total-budget meter under the donut. Pure, server-renderable, callers own the label line."
```

---

## Task 3: Budget meters in `Breakdown` (List view)

Give `Breakdown` an optional `limits` map. Rows with a limit show `฿spent / ฿limit` in the header and a `BudgetMeter` in place of the plain bar; rows without a limit are unchanged. Other callers (Records, accounts) pass no `limits` and are unaffected.

**Files:**
- Modify: `src/features/entries/ui/Breakdown.tsx`

Note the sign convention: `Breakdown` rows carry `total` as a **negative** magnitude (spending). Spend passed to the budget model must be `Math.abs(b.total)`.

- [ ] **Step 1: Add the `limits` prop and per-row meter branch**

Replace the entire contents of `src/features/entries/ui/Breakdown.tsx` with:

```tsx
import { formatBaht } from '@shared/money';
import { toBars } from '../breakdown';
import type { Breakdown as BreakdownRow } from '../queries';
import { emojiFor, hueFor } from '@features/categories/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import type { IconSet } from '@features/settings/queries';
import { toBudgetTotal } from '@features/budgets/budget-status';
import { BudgetMeter } from '@features/budgets/ui/BudgetMeter';

// A ranked bar list — outflow-heavy categories/accounts read at a glance. Magnitudes only (spending
// is negative); the bar width is relative to the biggest row in the set. Pass `emojis` to lead each
// row with its category marker, rendered per `iconSet`; `hues` gives each marker its picked color.
// Pass `limits` (category → monthly limit) to turn budgeted rows into spent-vs-limit meters; rows
// with no limit keep the plain relative bar.
export function Breakdown({
  title,
  rows,
  emojis,
  hues,
  iconSet = 'emoji',
  limits,
}: {
  title: string;
  rows: BreakdownRow[];
  emojis?: Record<string, string>;
  hues?: Record<string, number>;
  iconSet?: IconSet;
  limits?: Map<string, number>;
}) {
  const bars = toBars(rows);
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {bars.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing in this cycle.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bars.map((b) => {
            const spent = Math.abs(b.total);
            const limit = limits?.get(b.key);
            const status = limit === undefined ? null : toBudgetTotal(limit, spent);
            return (
              <li key={b.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {emojis ? (
                      <CategoryIcon
                        emoji={emojiFor(emojis, b.key)}
                        name={b.key}
                        size="sm"
                        iconSet={iconSet}
                        hue={hues ? hueFor(hues, b.key) : undefined}
                      />
                    ) : null}
                    <span className="truncate">{b.key}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                      ({b.count})
                    </span>
                  </span>
                  <span className="tnum" style={{ color: 'var(--color-text)' }}>
                    {status
                      ? `${formatBaht(spent)} / ${formatBaht(status.limit ?? 0)}`
                      : formatBaht(spent)}
                  </span>
                </div>
                {status ? (
                  <BudgetMeter status={status} />
                ) : (
                  <div
                    className="h-2 overflow-hidden rounded"
                    style={{ background: 'var(--color-border)' }}
                  >
                    <div
                      className="h-full rounded"
                      style={{ width: `${b.pct}%`, background: 'var(--color-accent)' }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify existing tests + gates pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. No `Breakdown` unit test exists; other callers omit `limits` (optional), so they compile and render unchanged.

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/entries/ui/Breakdown.tsx
npm run typecheck && npm run lint && npm test
git add src/features/entries/ui/Breakdown.tsx
git commit -m "feat(features): show per-category budget meters in the List view" -m "Optional limits map turns budgeted rows into spent-vs-limit meters (state-colored, header shows ฿spent / ฿limit) via the shared BudgetMeter. Rows without a limit keep the plain relative bar. Other Breakdown callers pass no limits and are unchanged."
```

---

## Task 4: Wire budgets into the home page

Read budgets in the home Server Component, split the `category IS NULL` total from the per-category map, pass the map to `Breakdown`, and render the total meter under the donut when a total budget is set.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add imports**

In `src/app/page.tsx`, after the existing budgets-free imports, add these three import lines (grouped with the other feature imports, e.g. right after the `@features/settings/queries` import on line 12):

```tsx
import { ensureBudgetsTable } from '@features/budgets/schema';
import { getBudgets } from '@features/budgets/queries';
import { toBudgetTotal } from '@features/budgets/budget-status';
import { BudgetMeter } from '@features/budgets/ui/BudgetMeter';
```

- [ ] **Step 2: Bootstrap the table and read budgets**

In the body of `HomePage`, after `ensureCategoryMetaTable(db);` (line 37), add:

```tsx
  ensureBudgetsTable(db);
```

Then after `const total = slices.reduce((sum, s) => sum + s.value, 0);` (line 53), add the budget derivation:

```tsx
  // Standing budgets: the category=null row is the whole-cycle total; the rest are per-category
  // caps keyed by name. Spend magnitudes come straight from the category breakdown (totals are
  // negative — take the abs).
  const budgetRows = getBudgets(db);
  const totalLimit = budgetRows.find((b) => b.category === null)?.amount ?? null;
  const limits = new Map<string, number>();
  for (const b of budgetRows) {
    if (b.category !== null) limits.set(b.category, b.amount);
  }
  const totalStatus = totalLimit === null ? null : toBudgetTotal(totalLimit, total);
```

- [ ] **Step 3: Pass `limits` to the List `Breakdown`**

In the `showList` branch, add the `limits` prop to the `<Breakdown ... />` (currently lines 68-74):

```tsx
              <Breakdown
                title="Spending by category"
                rows={categoryBreakdown}
                emojis={emojiMap}
                hues={hueMap}
                iconSet={iconSet}
                limits={limits}
              />
```

- [ ] **Step 4: Render the total meter under the donut**

In the Chart branch, immediately after `<DonutChart rows={categoryBreakdown} />` (line 77) and before the legend `<ul ...>`, insert the total meter:

```tsx
                {totalStatus ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span style={{ color: 'var(--color-muted)' }}>Total budget</span>
                      <span className="tnum" style={{ color: 'var(--color-text)' }}>
                        {formatBaht(total)} / {formatBaht(totalStatus.limit ?? 0)}
                      </span>
                    </div>
                    <BudgetMeter status={totalStatus} />
                  </div>
                ) : null}
```

(`formatBaht` is already imported in `page.tsx`.)

- [ ] **Step 5: Verify gates pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Manually verify in the running app**

Run: `npm run dev:web` (serves at `http://127.0.0.1:4010`).
Check:
1. With no budgets set → homepage looks identical to before (both Chart and List).
2. Set a total budget + a couple category budgets on `/budgets`, return to `/`:
   - **Chart view:** a "Total budget ฿… / ฿…" meter appears under the donut, colored by state.
   - **List view:** budgeted categories show `฿spent / ฿limit` + a state-colored meter; unbudgeted categories keep the plain accent bar.
3. Push a category over its limit → its meter turns `--color-loss` red with an `over ฿…` caption.

- [ ] **Step 7: Commit**

```bash
npm run format:files src/app/page.tsx
npm run typecheck && npm run lint && npm test
git add src/app/page.tsx
git commit -m "feat(app): surface budgets on the homepage overview" -m "Read standing budgets in the home Server Component: pass per-category limits to the List Breakdown and render a total-budget meter under the donut when a total is set. No budgets set → the page is unchanged."
```

---

## Self-Review Notes

- **Spec coverage:** BudgetMeter (Task 2) ✓; meterColorVar + test (Task 1) ✓; List per-category meters with unbudgeted fallback (Task 3) ✓; total meter under donut, donut hole unchanged (Task 4) ✓; graceful degradation with no budgets (Tasks 3 & 4 — `limits` empty, `totalStatus` null) ✓; state colors from existing tokens (Task 1) ✓.
- **Type consistency:** `BudgetTotal` (`{ limit, spent, pct, remaining, state }`, `limit: number | null`) is the shared prop shape across Tasks 2/3/4. `toBudgetTotal(limit, spent)` and `meterColorVar(state)` signatures match their definitions. `limit` is `number | null` on `BudgetTotal`, so the `฿ / ฿` line uses `status.limit ?? 0` — though `status` is only built from a concrete `limit`, the `?? 0` keeps the type honest without `!`/`as`.
- **No schema/query/dep changes** beyond the additive `meterColorVar` export and the additive optional `limits` prop.
