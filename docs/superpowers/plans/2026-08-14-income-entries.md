# Income Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the ledger hold refunds (money handed back against spending that already happened) so a
฿2,000 card charge and a ฿500 cash repayment can both be recorded and every figure nets to ฿1,500.

**Architecture:** Income is a positive `amount` on an ordinary entry row, filed under the same
category as the expense it refunds. No schema change — `entries.amount` is already a signed `real`.
The work is (a) replacing `Math.abs(x)` with `-x` everywhere a ledger amount is *accumulated*, so an
inflow subtracts instead of adding, (b) dropping the `lt(entries.amount, 0)` clause from the reads
that feed those aggregations, (c) a direction toggle on the Keypad, and (d) an opt-in flag so backup
restore stops discarding inflows.

**Tech Stack:** TypeScript 5.9 strict (ESM), drizzle-orm query builder over a sqlite-proxy `Db`,
React 19 / Next 16 App Router (static export, all `'use client'`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-income-entries-design.md`

## Global Constraints

- **No `any`, no `as` casts, no `!` assertions, no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`.**
  Prefer `for..of` over `.forEach`, `type` aliases over `interface`.
- **No schema change.** Do not touch `src/features/entries/schema.ts`, `BOOTSTRAP_SQL` in
  `src/db/worker.ts`, or `src/db/column-migrations.ts`. If a task seems to need one, stop — the
  design is wrong, not the schema.
- **Quality gates before every commit**, run separately so failures surface individually:
  ```bash
  npm run format:files <changed files>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
- **Commit format:** `type(scope): description` + a body explaining WHY. Scopes here are `features`
  and `app`. Single scope word only. Use repeated `-m` flags — never `-F` and never a heredoc.
  **Never add a `Claude-Session:` trailer.**
- **Money formatters by provenance:** `formatBaht` for stored/computed figures, `formatSignedBaht`
  when a figure can be either sign, `formatBahtWhole` for glance figures.
- **Branch:** `feat/income-entries` (already created; the spec is committed there as `45b2861`).

## The rule this plan applies

```
Math.abs(x) whose result is ACCUMULATED        →  -x
Math.abs(x) used as a SORT KEY or on ONE ROW   →  unchanged
```

Negation is correct on both signs: an expense of `-2000` becomes `+2000`, an inflow of `+500`
becomes `-500`, and they sum to `1500`. `Math.abs` maps `+500` to `500`, which is why an inflow
currently reads as spending.

Tasks 1–3 are behaviour-preserving on today's data (every stored amount is negative, so `-x` and
`Math.abs(x)` agree). They only start to differ once Task 4 lets inflows through. That is deliberate:
each can be proven in isolation with synthetic rows before anything user-visible changes.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/features/entries/off-budget.ts` | discretionary vs off-budget split — feeds budget meter, pace, safe-to-spend, Today's allowance | 1 |
| `src/features/entries/donut.ts` | category breakdown → ring slices | 2 |
| `src/features/entries/breakdown.ts` | category breakdown → ranked bars | 2 |
| `src/features/entries/breakdown-matrix.ts` | window × category matrix for /month and /report | 2 |
| `src/features/entries/use-analytics.ts` | Trends' own matrix + category list | 2 |
| `src/features/entries/by-weekday.ts` | spend per day-of-week | 3 |
| `src/features/entries/by-note.ts` | spend per note text | 3 |
| `src/features/entries/year.ts` | /year per-cycle and per-category rollup | 3 |
| `src/features/entries/heatmap.ts` | day-of-cycle calendar intensity | 3 |
| `src/features/entries/queries.ts` | the read filters — where inflows are let in | 4 |
| `src/app/records/page.tsx` | group totals that can now be net-positive | 5 |
| `src/features/entries/ui/Keypad.tsx` | the direction toggle | 6 |
| `src/features/entries/import.ts` | `parseMonefyCsv` inflow policy | 7 |
| `src/features/settings/restore.ts` | opts into keeping inflows | 7 |

**Explicitly not touched:** `schema.ts`, `db/worker.ts`, `trips.ts` (already inflow-aware and
deliberately gross — see spec §5), `anomaly.ts` (consumes the matrix and already skips non-positive
totals), `top-transactions.ts`, `EntryForm.tsx` and `entry-form.ts` (already round-trip `direction`).

---

### Task 1: Net the budget split

`splitBudgetSpend` is what the budget meter, pace, safe-to-spend and Today's allowance all read. It
is the single highest-value site: get this right and the headline figures net correctly.

**Files:**
- Modify: `src/features/entries/off-budget.ts:20-35` and `:39-50`
- Test: `src/features/entries/off-budget.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: no signature change. `splitBudgetSpend(entries, offBudgetCategories, travelCurrencies)`
  still returns `{ discretionary: number; offBudget: number }`; `discretionaryByCategory(...)` still
  returns `Map<string, number>`. Only the arithmetic changes.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('off-budget rules', ...)` block in
`src/features/entries/off-budget.test.ts`. The file already defines
`row(amount, category, offBudget, currency = null)` at the top — reuse it, do not redefine it.

```ts
  it('splitBudgetSpend nets a refund against spend in the same category', () => {
    const entries = [row(-2000, 'Food', null), row(500, 'Food', null)];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: 1500,
      offBudget: 0,
    });
  });
  it('splitBudgetSpend keeps a refund on the same side as the spend it refunds', () => {
    // An inflow in an off-budget category reduces the off-budget side, not the discretionary side.
    const entries = [row(-12000, 'Insurance', null), row(2000, 'Insurance', null)];
    expect(splitBudgetSpend(entries, cats, noTravel)).toEqual({
      discretionary: 0,
      offBudget: 10000,
    });
  });
  it('discretionaryByCategory nets a refund within its category', () => {
    const entries = [row(-600, 'Food', null), row(100, 'Food', null)];
    expect(discretionaryByCategory(entries, cats, noTravel)).toEqual(new Map([['Food', 500]]));
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/features/entries/off-budget.test.ts
```

Expected: 3 failures. The first reports `discretionary: 2500` (received) vs `1500` (expected) —
`Math.abs(500)` added 500 instead of subtracting it.

- [ ] **Step 3: Replace the accumulator**

In `src/features/entries/off-budget.ts`, change line 30 inside `splitBudgetSpend`:

```ts
    const mag = -e.amount;
```

and line 47 inside `discretionaryByCategory`:

```ts
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + -e.amount);
```

Then replace the `splitBudgetSpend` doc comment (lines 20-21) with one that states the new rule:

```ts
// Split a cycle's entries into discretionary vs off-budget NET spend (the ledger stores outflows
// negative and inflows positive; negating makes an expense add and a refund subtract, so both come
// back positive-as-spend). Feeds the budget meter/pace/safe-to-spend and the Home disclose line.
// A side can go negative when a cycle's refunds exceed its spend — that is a true figure, not a bug.
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/features/entries/off-budget.test.ts
```

Expected: PASS, including the pre-existing `splitBudgetSpend returns magnitudes...` and
`discretionaryByCategory sums only non-off-budget entries...` tests, which must be unaffected
(all-negative input, where `-x` and `Math.abs(x)` agree).

- [ ] **Step 5: Run the full gates**

```bash
npm run format:files src/features/entries/off-budget.ts src/features/entries/off-budget.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/off-budget.ts src/features/entries/off-budget.test.ts
git commit -m "feat(features): net inflows in the budget split" -m "splitBudgetSpend used Math.abs to turn a stored-negative amount into a magnitude, which maps a +500 refund to +500 of spending. Negating instead makes an expense add and a refund subtract, so the budget meter, pace, safe-to-spend and Today's allowance all net once inflows are let through the reads." -m "No behaviour change yet: every stored amount is still negative, where -x and Math.abs(x) agree."
```

---

### Task 2: Net the category aggregates

Four modules turn a `Breakdown[]` (SQL `sum(amount)` per category, arriving negative) into slices,
bars and matrices. All four use `Math.abs` on the already-summed total.

**Files:**
- Modify: `src/features/entries/donut.ts:58`
- Modify: `src/features/entries/breakdown.ts:12-20`
- Modify: `src/features/entries/breakdown-matrix.ts:8-15` (comment) and `:33`
- Modify: `src/features/entries/use-analytics.ts:141` and `:194`
- Test: `src/features/entries/donut.test.ts`, `src/features/entries/breakdown.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: no signature changes. `toDonutSlices(rows: Breakdown[]): DonutSlice[]`,
  `toBars(items: Breakdown[]): Bar[]`, `buildBreakdownMatrix(db, windows): Promise<BreakdownMatrix>`
  all keep their shapes.

- [ ] **Step 1: Write the failing tests**

In `src/features/entries/donut.test.ts` the helper `row(key, total, count = 1)` already exists at
line 4. Add a new `describe` block at the end of the file:

```ts
describe('toDonutSlices with inflows', () => {
  it('nets a refund against its own category', () => {
    // sum(amount) for Food is -2000 + 500 = -1500
    const slices = toDonutSlices([row('Food', -1500, 2)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].value).toBe(1500);
  });

  it('drops a category whose refunds exceed its spend rather than drawing it as spending', () => {
    // A refund landing in a later cycle than the spend it refunds: Food nets POSITIVE.
    // Math.abs would have drawn a +400 wedge — spending that never happened.
    const slices = toDonutSlices([row('Rent', -9000, 1), row('Food', 400, 1)]);
    expect(slices.map((s) => s.name)).toEqual(['Rent']);
  });
});
```

In `src/features/entries/breakdown.test.ts`, add:

```ts
describe('toBars with inflows', () => {
  it('nets a refund into its category total', () => {
    const bars = toBars([{ key: 'Food', total: -1500, count: 2 }]);
    expect(bars[0].pct).toBe(100);
    expect(bars[0].share).toBe(100);
  });

  it('gives a net-positive category no width and no share', () => {
    const bars = toBars([
      { key: 'Rent', total: -9000, count: 1 },
      { key: 'Food', total: 400, count: 1 },
    ]);
    const food = bars.find((b) => b.key === 'Food');
    expect(food?.pct).toBe(0);
    expect(food?.share).toBe(0);
  });
});
```

`breakdown.test.ts` must import `toBars` from `./breakdown` — check the existing imports at the top
of the file and extend them rather than adding a duplicate import statement.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/features/entries/donut.test.ts src/features/entries/breakdown.test.ts
```

Expected: the two net-positive tests fail. The donut one reports `['Rent', 'Food']` — `Math.abs(400)`
became a 400-wide wedge. The bars one reports `pct: 4.44…` instead of `0`.

- [ ] **Step 3: Replace the accumulators**

`src/features/entries/donut.ts`, line 58 — inside `toDonutSlices`:

```ts
    .map((r) => ({ name: r.key, value: -r.total, count: r.count }))
```

The existing `.filter((s) => s.value > 0)` on the next line now does the clamping for free — a
net-positive category yields a negative value and falls out. Add above the `.map`:

```ts
  // ponytail: a ring cannot draw a negative wedge, so a category whose refunds exceed its spend is
  // dropped by the filter below rather than shown as a credit. The budget meter still carries the
  // true negative, so the two disagree by exactly the amount that could not be drawn. Give the ring
  // a signed centre figure if that ever misleads.
```

`src/features/entries/breakdown.ts`, replace the body of `toBars` (lines 12-20):

```ts
export function toBars(items: Breakdown[]): Bar[] {
  const net = items.map((i) => ({ item: i, value: Math.max(0, -i.total) }));
  const max = Math.max(0, ...net.map((n) => n.value));
  const sum = net.reduce((acc, n) => acc + n.value, 0);
  return net.map((n) => ({
    ...n.item,
    pct: max === 0 ? 0 : (n.value / max) * 100,
    share: sum === 0 ? 0 : Math.round((n.value / sum) * 100),
  }));
}
```

`Math.max(0, …)` clamps a net-positive category to a zero-width bar, matching the donut dropping it.
Without the clamp its magnitude would inflate `sum` and shrink every real row's share.

`src/features/entries/breakdown-matrix.ts`, line 33:

```ts
      byCategory.set(row.key, { value: -row.total, count: row.count });
```

and in its type comment (lines 9-10) replace `Values are MAGNITUDES — totals arrive negative (the
ledger's sign) and every read surface in this app shows spend.` with:

```ts
// ledger's sign) and inflows positive, so negating yields NET spend — a refund subtracts. A value
// can be negative when a window's refunds exceed its spend; consumers that render it must clamp.
```

`src/features/entries/use-analytics.ts`, line 141:

```ts
          byCategory.set(row.key, { total: -row.total, count: row.count });
```

and line 194:

```ts
        .map((r) => ({ name: r.key, value: -r.total, count: r.count }))
```

Line 195's existing `.filter((c) => c.value > 0)` clamps this one for free, exactly like the donut.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/features/entries/donut.test.ts src/features/entries/breakdown.test.ts src/features/entries/use-analytics.test.ts
```

Expected: PASS. `use-analytics.test.ts` has no new tests but must stay green.

- [ ] **Step 5: Run the full gates**

```bash
npm run format:files src/features/entries/donut.ts src/features/entries/donut.test.ts src/features/entries/breakdown.ts src/features/entries/breakdown.test.ts src/features/entries/breakdown-matrix.ts src/features/entries/use-analytics.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/donut.ts src/features/entries/donut.test.ts src/features/entries/breakdown.ts src/features/entries/breakdown.test.ts src/features/entries/breakdown-matrix.ts src/features/entries/use-analytics.ts
git commit -m "feat(features): net inflows in the category aggregates" -m "The donut, the ranked bars, the month/report matrix and the Trends category list all applied Math.abs to an already-summed category total, so a refund would have inflated the category it was refunding instead of reducing it." -m "A category whose refunds exceed its spend now falls out of the ring and gets a zero-width bar — a ring cannot draw a negative wedge, and an absent wedge lies less than a credit one."
```

---

### Task 3: Net the row-level rollups

Four modules accumulate `Math.abs(entry.amount)` one row at a time.

**Files:**
- Modify: `src/features/entries/by-weekday.ts:31`
- Modify: `src/features/entries/by-note.ts:7-17`
- Modify: `src/features/entries/year.ts:34`
- Modify: `src/features/entries/heatmap.ts:25`
- Test: `src/features/entries/by-weekday.test.ts`, `src/features/entries/by-note.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: no signature changes.

- [ ] **Step 1: Write the failing tests**

`src/features/entries/by-note.test.ts` already defines `row(note: string | null, amount: number)` at
line 5 — positional, reuse it. Add inside the existing `describe('topNotes', ...)`:

```ts
  it('nets a refund carrying the same note', () => {
    expect(topNotes([row('Dinner', -2000), row('Dinner', 500)])).toEqual([
      { note: 'Dinner', total: 1500, count: 2 },
    ]);
  });
```

`src/features/entries/by-weekday.test.ts` already defines `e(date: string, amount: number)` at line 6
— positional, reuse it. Add inside the existing `describe('byWeekday', ...)`:

```ts
  it('nets a refund against spend on the same weekday', () => {
    // 2026-08-14 is a Friday (UTC), matching this file's existing date comments.
    const stats = byWeekday([e('2026-08-14', -2000), e('2026-08-14', 500)]);
    expect(stats.rows.find((r) => r.day === 'Fri')).toEqual({ day: 'Fri', total: 1500, count: 2 });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/features/entries/by-note.test.ts src/features/entries/by-weekday.test.ts
```

Expected: both fail reporting `2500` where `1500` was expected.

- [ ] **Step 3: Replace the accumulators**

`src/features/entries/by-weekday.ts`, line 31:

```ts
    cell.total += -entry.amount;
```

`src/features/entries/by-note.ts`, line 16:

```ts
    byNote.set(key, { total: seen.total + -e.amount, count: seen.count + 1 });
```

and in its doc comment (lines 8-9) replace `Magnitudes (the ledger stores outflows negative), biggest
first.` with `Net (outflows stored negative, inflows positive; negating makes a refund subtract),
biggest first.`

`src/features/entries/year.ts`, line 34:

```ts
    const mag = -entry.amount;
```

`src/features/entries/heatmap.ts`, line 25:

```ts
  const totalByDate = new Map(dayGroups.map((g) => [g.date, Math.max(0, -g.total)]));
```

The `Math.max(0, …)` matters here specifically: `intensity` divides by the busiest day, and a
negative day total would produce a negative intensity that the render maps to no token at all. A day
that nets positive is simply the calm end of the scale.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/features/entries/by-note.test.ts src/features/entries/by-weekday.test.ts src/features/entries/heatmap.test.ts src/features/entries/year.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full gates**

```bash
npm run format:files src/features/entries/by-weekday.ts src/features/entries/by-weekday.test.ts src/features/entries/by-note.ts src/features/entries/by-note.test.ts src/features/entries/year.ts src/features/entries/heatmap.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/by-weekday.ts src/features/entries/by-weekday.test.ts src/features/entries/by-note.ts src/features/entries/by-note.test.ts src/features/entries/year.ts src/features/entries/heatmap.ts
git commit -m "feat(features): net inflows in the row-level rollups" -m "by-weekday, by-note, year and heatmap each accumulated Math.abs(amount) per row, which counts a refund as spending of the same size. Negating makes it subtract." -m "heatmap clamps at zero because intensity divides by the busiest day — a negative day total would fall off the scale rather than reading as calm."
```

---

### Task 4: Let inflows through the reads

This is the task that turns the feature on. Everything before it was arithmetic that no data
exercised yet.

**Files:**
- Modify: `src/features/entries/queries.ts:116-124` (`getEntriesInRange`), `:161-179`
  (`getCategoryBreakdown`), `:374-385` (`searchEntries`), `:389-394` (`getEntriesByCategory`)
- Test: `src/features/entries/queries.test.ts`

**Interfaces:**
- Consumes: the netting from Tasks 1-3 — without it this task produces wrong figures.
- Produces: `getEntriesInRange` and `getCategoryBreakdown` now include rows with `amount > 0`.
  Return types are unchanged (`EntryRow[]`, `Breakdown[]`).

**Do NOT change** `hasAnyExpense` (`:134-142`) or `getFirstExpenseDate` (`:148-157`). A ledger holding
only inflows has no spending history to show, and an ancient refund must not open an empty year on
/year's stepper. Their existing `lt(entries.amount, 0)` stays.

- [ ] **Step 1: Write the failing tests**

`src/features/entries/queries.test.ts` already defines `async function db()` at line 43 (it
bootstraps the Node shim plus the entries/budgets/recurrences tables) and already imports
`addEntries`, `getEntriesInRange`, `getCategoryBreakdown`, `hasAnyExpense` and `searchEntries`. Reuse
both — add no imports and no second db helper. Note the local variable must not be named `db`, since
that shadows the helper; this file's existing tests use `d`. Add a new `describe` block at the end:

```ts
describe('refunds in the read surfaces', () => {
  it('getEntriesInRange includes inflows so refunds reach the aggregations', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-08-14', account: 'Card', category: 'Food', amount: -2000 },
      { date: '2026-08-14', account: 'Cash', category: 'Food', amount: 500 },
    ]);
    const rows = await getEntriesInRange(d, '2026-08-01', '2026-08-31');
    expect(rows).toHaveLength(2);
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBe(-1500);
  });

  it('getCategoryBreakdown nets an inflow into its category', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-08-14', account: 'Card', category: 'Food', amount: -2000 },
      { date: '2026-08-14', account: 'Cash', category: 'Food', amount: 500 },
    ]);
    expect(await getCategoryBreakdown(d, '2026-08-01', '2026-08-31')).toEqual([
      { key: 'Food', total: -1500, count: 2 },
    ]);
  });

  it('hasAnyExpense stays false for an inflow-only ledger', async () => {
    const d = await db();
    await addEntries(d, [{ date: '2026-08-14', account: 'Cash', category: 'Food', amount: 500 }]);
    expect(await hasAnyExpense(d)).toBe(false);
  });

  it('searchEntries finds a refund', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-08-14', account: 'Cash', category: 'Food', amount: 500, note: 'Dinner split' },
    ]);
    expect(await searchEntries(d, 'split')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/features/entries/queries.test.ts
```

Expected: the first, second and fourth fail (1 row instead of 2; `total: -2000, count: 1`; 0 rows).
The `hasAnyExpense` one passes already — it is a regression guard, not a change.

- [ ] **Step 3: Drop the filter from the four netting reads**

`src/features/entries/queries.ts` — replace the comment at lines 116-119 with:

```ts
// moniflow tracks spending, but the ledger holds refunds too: money handed back against spending
// that already happened (a friend repaying their share while the card carried the whole bill). They
// are ordinary rows with a POSITIVE amount, filed under the category they refund, so every sum here
// nets on its own. Consumers negate rather than Math.abs — see off-budget.ts and donut.ts.
```

then line 122:

```ts
    .where(and(gte(entries.date, start), lte(entries.date, end)))
```

line 175 (inside `getCategoryBreakdown`):

```ts
      .where(and(gte(entries.date, start), lte(entries.date, end)))
```

line 381 (inside `searchEntries`):

```ts
    .where(or(has(entries.note), has(categories.name), has(accounts.name)))
```

line 391 (inside `getEntriesByCategory`):

```ts
    .where(eq(categories.name, category))
```

Update the two doc comments that state the old invariant: line 371-372 (`expenses only (same
spending-tracker scope as the cycle reads)` → `refunds included, so a repayment is findable`) and
line 387 (`All-time expenses for one category` → `All-time entries for one category, refunds
included`).

After removing `lt` from these four call sites, check whether `lt` is still imported and used —
`hasAnyExpense` and `getFirstExpenseDate` still use it, so the import at line 8 stays. Do not remove
it; `npm run lint` will tell you if that changes.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/features/entries/queries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full suite — this is where regressions surface**

```bash
npm test
```

Expected: all pass. If a test in `use-home.test.ts`, `use-analytics.test.ts`, `use-records.test.ts`,
`use-year.test.ts`, `use-month.test.ts` or `use-category-report.test.ts` fails, read it before
changing it: a genuine assertion about netting should be updated, but a failure showing an inflow
being ADDED means a `Math.abs` was missed in Tasks 1-3. Find and fix the site rather than the test.

- [ ] **Step 6: Run the remaining gates**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck
npm run lint
npm run format:check
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): let refunds through the cycle and search reads" -m "getEntriesInRange, getCategoryBreakdown, searchEntries and getEntriesByCategory dropped their amount<0 clause, so an inflow now reaches the aggregations that were taught to net in the preceding commits." -m "hasAnyExpense and getFirstExpenseDate keep the filter on purpose: an inflow-only ledger has no spending history, and an ancient refund must not open an empty year on /year's stepper."
```

---

### Task 5: Sign-aware group totals in Records

Records prints a total for the filtered set and for each day section. Both can now be net-positive,
and `formatBaht(Math.abs(total))` would print a refund as if it were spending.

**Files:**
- Modify: `src/app/records/page.tsx:216` and `:279`

**Interfaces:**
- Consumes: Task 4 (inflows now reach `use-records`).
- Produces: nothing consumed by later tasks.

`use-records.ts:164` and `:176` already sum `e.amount` signed and need no change — the totals arriving
here are correct, only their rendering is wrong.

- [ ] **Step 1: Change the two renders**

The sign appears only on the exception. Signing unconditionally would print `+฿1,500` on every
ordinary spending day, which reads worse than the bug being fixed — a spending list whose every row
is marked "positive" tells the reader nothing.

`src/app/records/page.tsx` line 216 — the filtered-set total:

```tsx
              <span className="tnum text-sm font-semibold">
                {total > 0 ? formatSignedBaht(-total) : formatBaht(-total)}
              </span>
```

line 279 — the day-section total:

```tsx
                  <span>
                    {section.total > 0
                      ? formatSignedBaht(-section.total)
                      : formatBaht(-section.total)}
                  </span>
```

Both negate first, turning the ledger's sign into spend-positive. A spending day then renders
exactly as it does today (`฿1,500`); a day whose refunds exceeded its spend renders `−฿500`, reading
as "money came back" rather than "you spent ฿500".

Extend the existing `@shared/money` import statement at the top of the file to include
`formatSignedBaht` — do not add a second import statement.

- [ ] **Step 2: Verify the types and lint**

```bash
npm run format:files src/app/records/page.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass. There is no unit test for this file (it is a route component); Task 8's browser
pass is what proves it.

- [ ] **Step 3: Commit**

```bash
git add src/app/records/page.tsx
git commit -m "fix(app): mark a refund-positive total in Records with its sign" -m "The filtered-set and day-section totals rendered formatBaht(Math.abs(total)), so a day whose refunds exceeded its spend printed as if that money had been spent." -m "The sign appears only on the exception — an ordinary spending day still reads a plain baht figure, so the list does not sprout a + on every row."
```

---

### Task 6: The Keypad direction toggle

`parseEntryForm` already reads a `direction` field and flips the sign (`entry-form.ts:33,59`), and
`Keypad.tsx:204` already submits `<input type="hidden" name="direction" value="expense" />`
hardcoded. This task makes that value dynamic and adds the control.

**Files:**
- Modify: `src/features/entries/ui/Keypad.tsx:204` (the hidden field), around `:136-151` (state),
  around `:306` (the amount display), around `:408-421` (the toggle row)
- Test: `src/features/entries/entry-form.test.ts`

**Interfaces:**
- Consumes: Tasks 1-4 (the entered refund must net once saved).
- Produces: nothing consumed by later tasks.

Do not touch `EntryForm.tsx` or `use-edit-entry.ts` — the edit route's Expense/Income radio and its
`entry.amount < 0` default already round-trip the sign.

- [ ] **Step 1: Write the failing test**

`src/features/entries/entry-form.test.ts` already defines `formData(fields)` at line 4, a `base`
fields object at line 12 and `CODES` at line 24. Reuse all three. Add inside the existing
`describe('parseEntryForm', ...)`:

```ts
  it('direction=income stores a positive amount and a positive original', () => {
    const fd = formData({ ...base, direction: 'income', amount: '500', thb: '500' });
    const result = parseEntryForm(fd, CODES);
    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrows the union without a cast
    expect(result.entry.amount).toBe(500);
    expect(result.entry.originalAmount).toBe(500);
  });
```

`if (!result.ok) return;` is how this narrows `ParseResult` — the codebase bans `as` and `!`.

- [ ] **Step 2: Run the test**

```bash
npm test -- src/features/entries/entry-form.test.ts
```

Expected: PASS immediately if the file already covers this; if it fails, `parseEntryForm` has
regressed and must be fixed before continuing. This test is a guard on an existing contract, not new
behaviour — it is here because the Keypad is about to start relying on it.

- [ ] **Step 3: Add the direction state**

In `src/features/entries/ui/Keypad.tsx`, alongside the other `useState` calls (near line 136-151),
add:

```tsx
  // Refunds only — money handed back against spending that already happened, filed under the
  // category it refunds. On edit, follow the row's own sign.
  const [isIncome, setIsIncome] = useState(entry !== undefined && entry.amount > 0);
```

- [ ] **Step 4: Make the hidden field dynamic**

Replace line 204:

```tsx
      <input type="hidden" name="direction" value={isIncome ? 'income' : 'expense'} />
```

- [ ] **Step 5: Sign the amount display**

Replace the amount `<span>` at line ~306:

```tsx
          <span
            className="tnum text-4xl font-semibold"
            style={{
              color: !validAmount
                ? 'var(--color-faint)'
                : isIncome
                  ? 'var(--color-gain)'
                  : 'var(--color-text)',
            }}
          >
            {isIncome ? '+' : ''}
            {isThb ? formatBahtKeyed(amount ?? 0) : formatCurrency(amount ?? 0, currency)}
          </span>
```

The explicit `+` carries the state without relying on colour alone — the same reason
`formatSignedBaht` prints a sign (`shared/money.ts:53-55`) and `SwipeRow.tsx:150-151` pairs
`--color-gain` with one.

- [ ] **Step 6: Add the toggle**

Directly above the "Exclude from budget (one-off)" label at line ~411, add a sibling row:

```tsx
        {/* Refund toggle. Quiet, and here rather than in the top date/currency/account row: this
            happens a few times a month, while that row is read on every entry and has already been
            trimmed once to keep "Choose category" above the fold on a 412px frame. */}
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text)' }}>
          <input
            type="checkbox"
            checked={isIncome}
            onChange={(e) => setIsIncome(e.target.checked)}
          />
          Money received (refund)
        </label>
```

- [ ] **Step 7: Run the gates**

```bash
npm run format:files src/features/entries/ui/Keypad.tsx src/features/entries/entry-form.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/entries/ui/Keypad.tsx src/features/entries/entry-form.test.ts
git commit -m "feat(features): let the keypad record a refund" -m "parseEntryForm has always read a direction field, but the keypad hardcoded value=\"expense\", so the only way to enter money received was to subtract it in your head before keying the bill — which then disagreed with the card statement." -m "The toggle sits with the off-budget one rather than in the top chip row: it is a monthly event, and that row is read on every entry. The display carries an explicit + as well as gain colour so the state survives grayscale."
```

---

### Task 7: Backup restore preserves refunds

moniflow's own backup format is Monefy CSV, so `restore.ts` and the legacy Monefy import share one
parser with opposite needs. Left alone, every restore silently deletes every refund — the same defect
class as the `off_budget` loss fixed in v1.8.1, which only bit on a fresh device, i.e. the one
situation a backup exists for.

**Files:**
- Modify: `src/features/entries/import.ts:82-101`
- Modify: `src/features/settings/restore.ts:48`
- Test: `src/features/entries/import.test.ts`, plus a round-trip test in the settings feature

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseMonefyCsv(text: string, opts?: { keepInflows?: boolean }): ImportResult`. The
  parameter is optional and defaults to dropping inflows, so `actions.ts:117` (the legacy Monefy
  import) needs no change and its behaviour is byte-for-byte identical.

- [ ] **Step 1: Write the failing tests**

`src/features/entries/import.test.ts` builds CSV inline from a `header` const declared at the top of
`describe('parseMonefyCsv', ...)`. It already imports `parseMonefyCsv` and `serializeMonefyCsv`.
Add inside that same describe so `header` is in scope:

```ts
  it('drops inflows by default, so a Monefy export cannot import its income categories', () => {
    const csv = `${header}
14/08/2026,Cash,Food,-2000,THB,-2000,THB,
14/08/2026,Cash,Salary,30000,THB,30000,THB,`;
    const { entries, skipped } = parseMonefyCsv(csv);
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('keeps inflows when asked, so a moniflow backup restores its refunds', () => {
    const csv = `${header}
14/08/2026,Card,Food,-2000,THB,-2000,THB,
14/08/2026,Cash,Food,500,THB,500,THB,`;
    const { entries, skipped } = parseMonefyCsv(csv, { keepInflows: true });
    expect(entries.map((e) => e.amount)).toEqual([-2000, 500]);
    expect(skipped).toBe(0);
  });

  it('round-trips a refund through serialize and parse', () => {
    // The bug this guards: serializeMonefyCsv writes +500 correctly, parseMonefyCsv used to eat it,
    // so export -> restore lost every refund with no error anywhere.
    const rows = [
      {
        date: '2026-08-14',
        account: 'Card',
        category: 'Food',
        amount: -2000,
        currency: 'THB',
        originalAmount: -2000,
        note: null,
        offBudget: null,
      },
      {
        date: '2026-08-14',
        account: 'Cash',
        category: 'Food',
        amount: 500,
        currency: 'THB',
        originalAmount: 500,
        note: null,
        offBudget: null,
      },
    ];
    const back = parseMonefyCsv(serializeMonefyCsv(rows), { keepInflows: true }).entries;
    expect(back.map((e) => e.amount)).toEqual([-2000, 500]);
  });
```

`ExportRow` (`import.ts:147-150`) is `Pick<EntryRow, 'date' | 'account' | 'category' | 'amount' |
'currency' | 'originalAmount' | 'note' | 'offBudget'>` — exactly the eight fields above. It has no
`time` and no `id`; adding either makes it an excess-property error under strict TS.

The Monefy column order the `header` const declares is `date, account, category, amount, currency,
converted amount, currency, description` — column 3 is the ORIGINAL amount and column 5 the
converted one, which is why each row above repeats the figure.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- src/features/entries/import.test.ts
```

Expected: the second and third fail (1 entry instead of 2). The first passes — it is the
regression guard proving the legacy Monefy path is unchanged.

- [ ] **Step 3: Add the opt-in**

`src/features/entries/import.ts` — change the signature at line 82:

```ts
export function parseMonefyCsv(
  text: string,
  opts?: { keepInflows?: boolean },
): ImportResult {
```

replace the comment and guard at lines 93-101:

```ts
    // Two callers, opposite needs. The legacy Monefy import (entries/actions.ts) must drop inflows:
    // a real Monefy export carries income-only categories (salary, transfers-in) that would pollute
    // the ledger and desync the /categories counts. moniflow's OWN backup happens to use the same
    // CSV format (settings/restore.ts) and must keep them, or every restore silently deletes every
    // refund — the off_budget v1.8.1 defect class, which only bites on a fresh device.
    // ponytail: sign is the whole test — Monefy marks outflows negative.
    const amount = cleanAmount(cols[5]);
    if (amount >= 0 && opts?.keepInflows !== true) {
      skipped += 1;
      continue;
    }
```

`src/features/settings/restore.ts` line 48:

```ts
    const rows = parseMonefyCsv(data.entriesCsv, { keepInflows: true }).entries;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- src/features/entries/import.test.ts
```

Expected: PASS.

- [ ] **Step 5: Confirm the guard can actually fail**

Temporarily revert `restore.ts:48` to `parseMonefyCsv(data.entriesCsv).entries` and re-run the
settings restore tests:

```bash
npm test -- src/features/settings
```

If nothing fails, the restore path has no test that exercises a refund — add one before continuing.
A guard that cannot fail is what the currency-catalog round shipped three of. Restore the
`{ keepInflows: true }` argument afterwards and confirm green again.

- [ ] **Step 6: Run the full gates**

```bash
npm run format:files src/features/entries/import.ts src/features/entries/import.test.ts src/features/settings/restore.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/entries/import.ts src/features/entries/import.test.ts src/features/settings/restore.ts
git commit -m "fix(features): stop backup restore from eating refunds" -m "moniflow's backup format is Monefy CSV, so restore.ts shares parseMonefyCsv with the legacy Monefy import — which drops every positive amount on purpose, to keep a real Monefy export's salary and transfer categories out of the ledger." -m "parseMonefyCsv takes an opt-in keepInflows flag, defaulting to the existing behaviour so the Monefy path is byte-for-byte unchanged, and restore passes it. Without this a refund survived until the first restore and then vanished with no error — the off_budget v1.8.1 defect class, which only bites on a fresh device."
```

---

### Task 8: Verify in a browser, then update the project docs

Tests run against the better-sqlite3 Node shim and prove none of the WASM worker, OPFS, or layout. A
data-layer change is not done until it has been driven at 412px.

**Files:**
- Modify: `CLAUDE.md` (the "Project Overview" paragraph that states the expenses-only invariant)

- [ ] **Step 1: Run the app**

```bash
npm run dev:web
```

Open `http://127.0.0.1:4010` at a 412px viewport. Note the dev ledger holds **real financial data**
and delete lives only in the Records swipe — do not clear anything.

- [ ] **Step 2: Drive the scenario**

1. Record an expense: ฿2,000, account with a card, category ค่าอาหาร. Note Home's donut wedge for
   that category, the budget meter, and Today's allowance.
2. Record a refund: tap ＋, key 500, tick **Money received (refund)**, confirm the display reads
   `+฿500` in green, pick a cash account, pick the **same** category ค่าอาหาร, save.
3. Confirm on Home: the ค่าอาหาร wedge dropped by ฿500, the budget meter's remaining rose by ฿500,
   and Today's allowance rose. All three must agree.
4. Open Records: the refund row shows `+฿500` in gain colour, and its day-section total is ฿500 lower
   than before.
5. Open Settings → Backup, export, then restore that export, and confirm the refund is still there.
6. Delete the two test rows via the Records swipe.

- [ ] **Step 3: Update the project overview**

`CLAUDE.md`'s Project Overview states the expenses-only invariant as a rule
(*"the ledger holds outflows only … every UI read surface shows expenses (`amount < 0`), enforced in
the queries"*). Replace that sentence with one describing the real rule:

```markdown
It is a **spending tracker with refunds**: the ledger is overwhelmingly outflows, but a positive
`amount` row records money handed back against spending that already happened (a friend repaying
their share while the card carried the whole bill). A refund is filed under the category it refunds
and every summed figure nets — consumers negate a stored amount rather than taking `Math.abs`, so an
expense adds and a refund subtracts. Standalone income (salary) is deliberately unmodellable: it
would drive its category net-positive and simply drop out of the donut. Bulk Monefy CSV import still
drops inflows (`parseMonefyCsv`, whose `keepInflows` flag exists for moniflow's own backup restore);
`hasAnyExpense` and `getFirstExpenseDate` still filter `amount < 0`.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe the refund model in the project overview" -m "The overview stated expenses-only as an invariant enforced in every query, which is no longer true and would mislead the next reader into re-adding the filter." -m "Records what actually holds now: refunds net, salary is deliberately unmodellable, and the two reads that still filter on sign."
```

---

## Self-review notes

- **Spec coverage:** §1 data model → no task by design (nothing to do). §2 netting rule → Tasks 1-3
  (the change list) and Task 4 (the read filters). §3 entry surface → Task 6. §4 backup round-trip →
  Task 7. §5 untouched → asserted in the File Structure table's exclusion list. §6 tests → each task
  writes its own; the `use-home.test.ts` allowance assertion the spec lists is covered by Task 4's
  full-suite step plus Task 8's browser check, since the hook's figures are composed from
  `splitBudgetSpend` (Task 1) and need no separate arithmetic of their own.
- **The `todayIso` mock leak** noted in the spec applies only if a new test is added to
  `use-home.test.ts`. No task adds one; if Task 4's full-suite run forces a change there, pin the
  date inside that `describe` rather than relying on the file-level mock.
- **Task 5** deliberately renders a sign only on the exception. Signing every total would put a `+`
  on every ordinary spending day, which is a worse read than the bug being fixed.
