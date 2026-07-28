# Currency Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the hardcoded currency list into a `currencies` DB table with a per-currency `off_budget` flag, so a currency can be added from the phone while abroad and travel spending drops out of budget meters automatically.

**Architecture:** A new `currencies` feature owns the table, its queries and its page. `CURRENCIES`/`isCurrency` in `entry-form.ts` stop being the source of truth — `Currency` becomes `string`, validated at runtime against the table. `isOffBudget` gains a middle tier between the per-entry override and the category default: a travel currency. The table seeds itself on first read so an existing OPFS database and a fresh one behave identically.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless relative imports), drizzle-orm query builder over the sqlite-proxy seam, Next 16 App Router (`output: 'export'`, every page `'use client'`), Vitest with the better-sqlite3 Node shim, Tailwind v4.

## Global Constraints

- Branch is `feat/currency-catalog`, already created off `main`. Never commit to `main`.
- No `any`, no `as` casts, no `!` assertions, no `@ts-ignore`/`@ts-expect-error`/`@ts-nocheck`. Prefer `type` over `interface`, `for..of` over `.forEach`, `satisfies`/`as const` for config objects.
- All formatting of dates and numbers goes through `Intl`. Never string-manipulate a date.
- **Schema lives in TWO places and must stay in lockstep:** the feature's `schema.ts` (`ensure<Table>Table`, used by the Node shim in tests) and `BOOTSTRAP_SQL` in `src/db/worker.ts` (the shipping DDL). A new table must ALSO be added to the `TABLES` array in `src/db/schema-lockstep.test.ts:69`, or the drift test silently does not cover it.
- A new **table** is safe for existing users — `CREATE TABLE IF NOT EXISTS` runs on every open. A new **column** on an existing table is not, and needs a `COLUMN_MIGRATIONS` entry in `src/db/column-migrations.ts`. This plan adds only a table.
- **The backup format must go v3 → v4.** `CatalogData.version` is typed `1 | 2 | 3` at `src/features/settings/catalog.ts:44`. Skipping this means currency config silently vanishes on a fresh-device restore — the exact defect `off_budget` had before v1.8.1.
- `db/` must not import any feature. That is why `BOOTSTRAP_SQL` duplicates the DDL.
- Both db backends are sqlite-proxy drivers: rows come back as **arrays of column values**, positionally.
- TDD. Failing test first, then implementation. Commit after each task.
- Gates, run separately so failures surface individually: `npm run format:files <changed>`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. All must pass before a commit.
- Commit format `type(scope): description` with a body explaining why. Scopes here: `db`, `features`, `shared`, `app`. Never add a `Claude-Session:` trailer.
- A UI change is not done until it has been driven in a browser at 412px. Tests run against the Node shim and prove the queries only — never the worker, OPFS, or layout.

---

### Task 1: The `currencies` table

**Files:**
- Create: `src/features/currencies/schema.ts`
- Modify: `src/db/worker.ts:24-46` (add an 8th statement to `BOOTSTRAP_SQL`)
- Modify: `src/db/schema-lockstep.test.ts:40-77` (import + call the new ensure fn, add `'currencies'` to `TABLES`)
- Test: `src/db/schema-lockstep.test.ts` (existing suite covers the new table once listed)

**Interfaces:**
- Consumes: nothing.
- Produces: `currencies` drizzle table with columns `code: text (PK)`, `offBudget: integer notNull default 0`, `sortOrder: integer`, `archived: integer notNull default 0`; `type CurrencyRow = typeof currencies.$inferSelect`; `ensureCurrenciesTable(db: Db): Promise<void>`.

- [ ] **Step 1: Write the failing test** — add the table to the lockstep suite.

In `src/db/schema-lockstep.test.ts`, add the import alongside the other ensure fns:

```ts
import { ensureCurrenciesTable } from '@features/currencies/schema';
```

Add the call inside `featureDb()`, after `ensureRecurrencesTable(db)`:

```ts
  await ensureCurrenciesTable(db);
```

Add the table name to `TABLES`:

```ts
const TABLES = [
  'entries',
  'categories',
  'accounts',
  'budgets',
  'settings',
  'trip_titles',
  'recurrences',
  'currencies',
];
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/schema-lockstep.test.ts`
Expected: FAIL — cannot resolve `@features/currencies/schema`.

- [ ] **Step 3: Write the schema**

Create `src/features/currencies/schema.ts`:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// The currency catalog. Replaces the hardcoded CURRENCIES const so a code can be added from the
// phone mid-trip — the failure this fixes is landing somewhere unplanned and having to type a
// foreign amount into a THB field, which is how every historical FX defect in this ledger started.
//
// `code` is the ISO 4217 string ('JPY'); it is the primary key, so a currency is referenced by code
// everywhere and there is no surrogate id to resolve. No `symbol` column on purpose — Intl derives
// the glyph from the code (see shared/money.ts currencySymbol); storing it would duplicate data the
// platform already has.
//
// off_budget: 1 = spending in this currency means "I am abroad", so it is excluded from budget
// meters/pace (see entries/off-budget.ts). USD/EUR/GBP stay 0 — in this ledger they are online
// purchases (a Claude subscription), which are ordinary budgeted spend.
export const currencies = sqliteTable('currencies', {
  code: text('code').primaryKey(),
  offBudget: integer('off_budget').notNull().default(0),
  sortOrder: integer('sort_order'),
  archived: integer('archived').notNull().default(0),
});

export type CurrencyRow = typeof currencies.$inferSelect;
export type NewCurrencyRow = typeof currencies.$inferInsert;

export async function ensureCurrenciesTable(db: Db): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY,
      off_budget INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
}
```

- [ ] **Step 4: Add the same DDL to the shipping bootstrap**

In `src/db/worker.ts`, append to the `BOOTSTRAP_SQL` array (after the `recurrences` statement) and update the "seven-table" wording in the comment above it to "eight-table":

```ts
  `CREATE TABLE IF NOT EXISTS currencies (code TEXT PRIMARY KEY,
     off_budget INTEGER NOT NULL DEFAULT 0, sort_order INTEGER, archived INTEGER NOT NULL DEFAULT 0)`,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/db/schema-lockstep.test.ts`
Expected: PASS — all three lockstep assertions green for `currencies` (declared tables match, columns match, unique constraints match).

- [ ] **Step 6: Run the gates**

```bash
npm run format:files src/features/currencies/schema.ts src/db/worker.ts src/db/schema-lockstep.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/features/currencies/schema.ts src/db/worker.ts src/db/schema-lockstep.test.ts
git commit -m "feat(db): add the currencies table" -m "The currency list was a compile-time const, so adding a code needed an edit and a deploy — impossible from a phone abroad, which is exactly when a new currency is needed. This is the table that will hold it, plus the per-currency off_budget flag that marks travel spend." -m "DDL is duplicated into worker.ts BOOTSTRAP_SQL per the db/-imports-no-feature rule, and 'currencies' is added to the lockstep test's TABLES list so the two definitions are actually compared."
```

---

### Task 2: Seed-on-read queries

**Files:**
- Create: `src/features/currencies/queries.ts`
- Test: `src/features/currencies/queries.test.ts`

**Interfaces:**
- Consumes: `currencies`, `ensureCurrenciesTable`, `CurrencyRow` from Task 1.
- Produces:
  - `SEED_CURRENCIES: readonly { code: string; offBudget: number; sortOrder: number }[]`
  - `listCurrencies(db: Db): Promise<CurrencyRow[]>` — seeds on first call, returns non-archived rows ordered by `sortOrder` then `code`
  - `listAllCurrencies(db: Db): Promise<CurrencyRow[]>` — includes archived, for the management page
  - `getTravelCurrencies(db: Db): Promise<Set<string>>` — codes with `off_budget = 1`
  - `getCurrencyCodes(db: Db): Promise<Set<string>>` — every non-archived code, for validation
  - `addCurrency(db: Db, code: string): Promise<void>`
  - `setCurrencyOffBudget(db: Db, code: string, offBudget: boolean): Promise<void>`
  - `setCurrencyArchived(db: Db, code: string, archived: boolean): Promise<void>`
  - `restoreCurrencyCatalog(db: Db, rows: CurrencyCatalogRow[]): Promise<void>` — added in Task 6

- [ ] **Step 1: Write the failing test**

Create `src/features/currencies/queries.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureCurrenciesTable } from './schema';
import {
  listCurrencies,
  listAllCurrencies,
  getTravelCurrencies,
  getCurrencyCodes,
  addCurrency,
  setCurrencyOffBudget,
  setCurrencyArchived,
} from './queries';

let db: Db;

beforeEach(async () => {
  db = makeNodeProxyDb();
  await ensureCurrenciesTable(db);
});

describe('currency catalog', () => {
  it('seeds the known currencies on first read', async () => {
    const rows = await listCurrencies(db);
    expect(rows.map((r) => r.code)).toEqual(
      expect.arrayContaining(['THB', 'JPY', 'KRW', 'HKD', 'MOP', 'USD', 'EUR', 'GBP', 'SGD']),
    );
  });

  it('seeds only once — a second read does not duplicate rows', async () => {
    const first = await listCurrencies(db);
    const second = await listCurrencies(db);
    expect(second).toHaveLength(first.length);
  });

  it('marks the travel currencies off-budget and leaves online ones on-budget', async () => {
    const travel = await getTravelCurrencies(db);
    expect(travel).toEqual(new Set(['JPY', 'KRW', 'HKD', 'MOP']));
  });

  it('pins THB first, then orders by code', async () => {
    const rows = await listCurrencies(db);
    expect(rows[0]?.code).toBe('THB');
  });

  it('adds a currency that was not seeded', async () => {
    await addCurrency(db, 'TWD');
    const codes = await getCurrencyCodes(db);
    expect(codes.has('TWD')).toBe(true);
  });

  it('adding an existing currency is a no-op, not a duplicate-key crash', async () => {
    const before = await listCurrencies(db);
    await addCurrency(db, 'JPY');
    expect(await listCurrencies(db)).toHaveLength(before.length);
  });

  it('toggles off-budget on a currency', async () => {
    await setCurrencyOffBudget(db, 'USD', true);
    expect(await getTravelCurrencies(db)).toContain('USD');
    await setCurrencyOffBudget(db, 'USD', false);
    expect(await getTravelCurrencies(db)).not.toContain('USD');
  });

  it('hides an archived currency from the picker list but keeps the row', async () => {
    await setCurrencyArchived(db, 'GBP', true);
    expect((await listCurrencies(db)).map((r) => r.code)).not.toContain('GBP');
    expect((await listAllCurrencies(db)).map((r) => r.code)).toContain('GBP');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/currencies/queries.test.ts`
Expected: FAIL — cannot resolve `./queries`.

- [ ] **Step 3: Write the queries**

Create `src/features/currencies/queries.ts`:

```ts
import { eq, asc } from 'drizzle-orm';
import type { Db } from '@db/client';
import { currencies, type CurrencyRow } from './schema';

// The currencies this ledger has actually used, plus the ones its owner is likely to. off_budget = 1
// means "being in this currency means being abroad": JPY/KRW/HKD/MOP are trips, while USD/EUR/GBP
// appear here only as online purchases and must stay inside the monthly budget.
// THB is home currency, sorted first, and is never off-budget.
export const SEED_CURRENCIES = [
  { code: 'THB', offBudget: 0, sortOrder: 0 },
  { code: 'JPY', offBudget: 1, sortOrder: 1 },
  { code: 'KRW', offBudget: 1, sortOrder: 2 },
  { code: 'HKD', offBudget: 1, sortOrder: 3 },
  { code: 'MOP', offBudget: 1, sortOrder: 4 },
  { code: 'USD', offBudget: 0, sortOrder: 5 },
  { code: 'EUR', offBudget: 0, sortOrder: 6 },
  { code: 'GBP', offBudget: 0, sortOrder: 7 },
  { code: 'SGD', offBudget: 0, sortOrder: 8 },
] as const;

// Seed on READ, not on migration: an existing OPFS database gets the table from CREATE TABLE IF NOT
// EXISTS but no rows, and an empty currency picker is the same first-run dead end the empty category
// picker once was. Idempotent — a row that already exists is left exactly as the user configured it.
async function seedIfEmpty(db: Db): Promise<void> {
  const existing = await db.select({ code: currencies.code }).from(currencies).all();
  if (existing.length > 0) return;
  for (const row of SEED_CURRENCIES) {
    await db
      .insert(currencies)
      .values({ code: row.code, offBudget: row.offBudget, sortOrder: row.sortOrder })
      .onConflictDoNothing()
      .run();
  }
}

// Ordered for the picker: sortOrder first (THB is 0), then code so a user-added currency without an
// explicit order still lands somewhere stable rather than wherever sqlite feels like.
export async function listCurrencies(db: Db): Promise<CurrencyRow[]> {
  await seedIfEmpty(db);
  return db
    .select()
    .from(currencies)
    .where(eq(currencies.archived, 0))
    .orderBy(asc(currencies.sortOrder), asc(currencies.code))
    .all();
}

// Every row including archived ones — the management page needs to show what it can un-archive.
export async function listAllCurrencies(db: Db): Promise<CurrencyRow[]> {
  await seedIfEmpty(db);
  return db
    .select()
    .from(currencies)
    .orderBy(asc(currencies.sortOrder), asc(currencies.code))
    .all();
}

// The set isOffBudget consults. Archived currencies still count — a historical JPY row must stay
// off-budget even after the currency is hidden from the picker.
export async function getTravelCurrencies(db: Db): Promise<Set<string>> {
  await seedIfEmpty(db);
  const rows = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.offBudget, 1))
    .all();
  return new Set(rows.map((r) => r.code));
}

// Valid codes for entry validation — archived ones are excluded, so hiding a currency also stops new
// entries in it while leaving old ones intact.
export async function getCurrencyCodes(db: Db): Promise<Set<string>> {
  const rows = await listCurrencies(db);
  return new Set(rows.map((r) => r.code));
}

export async function addCurrency(db: Db, code: string): Promise<void> {
  await seedIfEmpty(db);
  await db.insert(currencies).values({ code }).onConflictDoNothing().run();
}

export async function setCurrencyOffBudget(db: Db, code: string, offBudget: boolean): Promise<void> {
  await db
    .update(currencies)
    .set({ offBudget: offBudget ? 1 : 0 })
    .where(eq(currencies.code, code))
    .run();
}

export async function setCurrencyArchived(db: Db, code: string, archived: boolean): Promise<void> {
  await db
    .update(currencies)
    .set({ archived: archived ? 1 : 0 })
    .where(eq(currencies.code, code))
    .run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/currencies/queries.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Run the gates**

```bash
npm run format:files src/features/currencies/queries.ts src/features/currencies/queries.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/features/currencies/
git commit -m "feat(features): seed and query the currency catalog" -m "Seeds on read rather than on migration: an existing OPFS db gets the table from CREATE TABLE IF NOT EXISTS but no rows, and an empty currency picker is the same first-run dead end the empty category picker was." -m "MOP is seeded because four Macau rows already exist in the ledger; it was never in the const, so opening one in the keypad silently rewrote it to THB."
```

---

### Task 3: Three-tier `isOffBudget`

**Files:**
- Modify: `src/features/entries/off-budget.ts`
- Modify: `src/features/entries/off-budget.test.ts`
- Modify: `src/features/entries/use-home.ts:99-126`
- Modify: `src/features/budgets/use-budgets-page.ts:44-48`

**Interfaces:**
- Consumes: `getTravelCurrencies` from Task 2.
- Produces: `isOffBudget(entry, offBudgetCategories, travelCurrencies)`, `splitBudgetSpend(entries, offBudgetCategories, travelCurrencies)`, `discretionaryByCategory(entries, offBudgetCategories, travelCurrencies)` — all three gain the same third parameter.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/entries/off-budget.test.ts` (match the existing file's helper for building an `EntryRow` — if it has a `makeEntry` factory, reuse it and add `currency`; otherwise build the literal inline):

```ts
describe('travel currencies', () => {
  const noCategories = new Set<string>();
  const travel = new Set(['JPY', 'HKD']);

  it('treats a travel-currency entry as off-budget', () => {
    const entry = makeEntry({ amount: -500, category: 'อาหาร', currency: 'JPY', offBudget: null });
    expect(isOffBudget(entry, noCategories, travel)).toBe(true);
  });

  it('leaves a non-travel foreign entry on budget', () => {
    const entry = makeEntry({ amount: -3647, category: 'บิลรายเดือน', currency: 'USD', offBudget: null });
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('leaves a THB entry on budget', () => {
    const entry = makeEntry({ amount: -100, category: 'อาหาร', currency: 'THB', offBudget: null });
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('treats a null currency as home currency', () => {
    const entry = makeEntry({ amount: -100, category: 'อาหาร', currency: null, offBudget: null });
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('lets an explicit per-entry 0 override the travel rule', () => {
    const entry = makeEntry({ amount: -500, category: 'อาหาร', currency: 'JPY', offBudget: 0 });
    expect(isOffBudget(entry, noCategories, travel)).toBe(false);
  });

  it('lets an explicit per-entry 1 override an on-budget currency', () => {
    const entry = makeEntry({ amount: -500, category: 'อาหาร', currency: 'THB', offBudget: 1 });
    expect(isOffBudget(entry, noCategories, travel)).toBe(true);
  });

  it('still falls through to the category default when nothing else applies', () => {
    const entry = makeEntry({ amount: -500, category: 'บิลรายปี', currency: 'THB', offBudget: null });
    expect(isOffBudget(entry, new Set(['บิลรายปี']), travel)).toBe(true);
  });

  it('splits a cycle containing both trip and home spend', () => {
    const entries = [
      makeEntry({ amount: -500, category: 'อาหาร', currency: 'JPY', offBudget: null }),
      makeEntry({ amount: -100, category: 'อาหาร', currency: 'THB', offBudget: null }),
    ];
    expect(splitBudgetSpend(entries, noCategories, travel)).toEqual({
      discretionary: 100,
      offBudget: 500,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/off-budget.test.ts`
Expected: FAIL — `isOffBudget` takes 2 arguments, and the travel assertions return `false`.

- [ ] **Step 3: Write the implementation**

Replace the three exported functions in `src/features/entries/off-budget.ts`:

```ts
// The single source of truth for "does this entry count against the budget?", in three tiers:
//   1. An explicit per-entry off_budget (0 or 1) always wins — that is the tri-state's whole job.
//   2. A travel currency means the entry was made abroad, and a trip is not this month's
//      discretionary spending. Derived, never stored: the currency column already says it, so a
//      second "is this a trip" flag would be the same duplication the category names used to carry.
//      Only currencies flagged off_budget count — USD/EUR/GBP here are online purchases.
//   3. Otherwise inherit the category default.
export function isOffBudget(
  entry: EntryRow,
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): boolean {
  if (entry.offBudget !== null && entry.offBudget !== undefined) return entry.offBudget === 1;
  if (entry.currency !== null && travelCurrencies.has(entry.currency)) return true;
  return offBudgetCategories.has(entry.category);
}

// Split a cycle's entries into discretionary vs off-budget spend magnitudes (the ledger stores outflows
// negative; both are returned positive). Feeds the budget meter/pace/safe-to-spend and the Home disclose line.
export function splitBudgetSpend(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): { discretionary: number; offBudget: number } {
  let discretionary = 0;
  let offBudget = 0;
  for (const e of entries) {
    const mag = Math.abs(e.amount);
    if (isOffBudget(e, offBudgetCategories, travelCurrencies)) offBudget += mag;
    else discretionary += mag;
  }
  return { discretionary, offBudget };
}

// Per-category discretionary spend (off-budget entries dropped) — the Budgets page feeds this to
// toBudgetRows so per-category meters match the Home total meter.
export function discretionaryByCategory(
  entries: EntryRow[],
  offBudgetCategories: Set<string>,
  travelCurrencies: Set<string>,
): Map<string, number> {
  const byCat = new Map<string, number>();
  for (const e of entries) {
    if (isOffBudget(e, offBudgetCategories, travelCurrencies)) continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + Math.abs(e.amount));
  }
  return byCat;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/off-budget.test.ts`
Expected: PASS.

- [ ] **Step 5: Thread the set through the two consumers**

In `src/features/entries/use-home.ts`, add the import:

```ts
import { getTravelCurrencies } from '@features/currencies/queries';
```

Add it to the `Promise.all` at line 99 and to the destructure:

```ts
    const [cutoff, emojiMap, hueMap, iconSet, offBudgetCategories, travelCurrencies] =
      await Promise.all([
        // …existing calls, unchanged…
        getOffBudgetCategories(db),
        getTravelCurrencies(db),
      ]);
```

Pass `travelCurrencies` into every `splitBudgetSpend` / `isOffBudget` / `discretionaryByCategory` call in the file, and add it to the object built at line 126 if that object is consumed downstream.

In `src/features/budgets/use-budgets-page.ts`, the same:

```ts
import { getTravelCurrencies } from '@features/currencies/queries';

    const [cycleEntries, offBudgetCategories, travelCurrencies] = await Promise.all([
      // …existing…
      getOffBudgetCategories(db),
      getTravelCurrencies(db),
    ]);
    const spentByCategory = discretionaryByCategory(
      cycleEntries,
      offBudgetCategories,
      travelCurrencies,
    );
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. If `use-home.test.ts` or `use-budgets-page.test.ts` fail on the new argument, update their fixtures to pass `new Set()` — that preserves their existing intent (no travel currencies configured).

- [ ] **Step 7: Run the gates**

```bash
npm run format:files src/features/entries/off-budget.ts src/features/entries/off-budget.test.ts src/features/entries/use-home.ts src/features/budgets/use-budgets-page.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/features/entries/off-budget.ts src/features/entries/off-budget.test.ts src/features/entries/use-home.ts src/features/budgets/use-budgets-page.ts
git commit -m "feat(features): treat travel-currency spend as off-budget" -m "A trip is not this month's discretionary spending, but until now every foreign row counted against the budget — a single Japan trip is ~87k baht, which erases the whole monthly cap on its own." -m "Derived from the currency column rather than stored: a second 'is this a trip' flag would duplicate what the column already says. Only currencies flagged off_budget qualify, so the USD subscription in the monthly-bills budget stays inside it."
```

---

### Task 4: Runtime currency validation replaces the const

**Files:**
- Modify: `src/features/entries/entry-form.ts:3-12,39`
- Modify: `src/features/entries/entry-form.test.ts`
- Modify: `src/features/entries/keypad-lists.ts:3,60-70`
- Modify: `src/features/settings/actions.ts:14,95`
- Modify: `src/features/recurring/rates.ts:3,30,55`
- Modify: `src/features/recurring/rule-form.ts:1,108`
- Modify: `src/features/entries/ui/EntryForm.tsx:4,117`
- Modify: `src/features/entries/ui/Keypad.tsx:9,121`
- Modify: `src/features/recurring/ui/RuleKeypad.tsx:7,101`

**Interfaces:**
- Consumes: `listCurrencies`, `getCurrencyCodes` from Task 2.
- Produces: `type Currency = string`; `parseEntryForm(fd, validCodes: Set<string>)` and `parseRuleForm(fd, validCodes: Set<string>)` take the valid-code set as a parameter, keeping both pure. `getKeypadCurrencies(db)` reads the table.

- [ ] **Step 1: Write the failing test**

In `src/features/entries/entry-form.test.ts`, update the currency cases and add one for a DB-added code:

```ts
const CODES = new Set(['THB', 'JPY', 'MOP']);

it('rejects a code that is not in the catalog', () => {
  const fd = makeFormData({ currency: 'XYZ' });
  expect(parseEntryForm(fd, CODES)).toEqual({ ok: false, error: 'Choose a valid currency.' });
});

it('accepts a code that only exists in the catalog, not in any const', () => {
  const fd = makeFormData({ currency: 'MOP', amount: '114', thb: '515.19' });
  const result = parseEntryForm(fd, CODES);
  expect(result.ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/entry-form.test.ts`
Expected: FAIL — `parseEntryForm` takes 1 argument; `MOP` is rejected by the const.

- [ ] **Step 3: Make the type and validation runtime**

In `src/features/entries/entry-form.ts`, replace lines 3-12:

```ts
// A currency is an ISO 4217 code held in the `currencies` table, not a compile-time union: the list
// has to be editable from the phone, because the moment a new currency is needed is the moment you
// are standing in a country you did not plan to visit. Validation is therefore runtime, against the
// caller-supplied set of catalog codes — parseEntryForm stays pure and DB-free.
export type Currency = string;

export function isCurrency(value: string, validCodes: Set<string>): boolean {
  return validCodes.has(value);
}
```

Change the signature and the guard:

```ts
export function parseEntryForm(fd: FormData, validCodes: Set<string>): ParseResult {
```

```ts
  if (!isCurrency(currency, validCodes)) return { ok: false, error: 'Choose a valid currency.' };
```

- [ ] **Step 4: Update every call site**

`src/features/entries/keypad-lists.ts` — drop the `CURRENCIES` import, read the table:

```ts
import { listCurrencies } from '@features/currencies/queries';
```

```ts
export async function getKeypadCurrencies(db: Db): Promise<KeypadCurrency[]> {
  const rank = new Map((await getCurrencyCounts(db)).map((c, i) => [c.currency, i]));
  const MAX = Number.MAX_SAFE_INTEGER;
  const codes = (await listCurrencies(db)).map((r) => r.code);
  const ordered = codes.sort((a, b) => {
    if (a === b) return 0;
    if (a === 'THB') return -1;
    if (b === 'THB') return 1;
    return (rank.get(a) ?? MAX) - (rank.get(b) ?? MAX);
  });
  return ordered.map((code) => ({ code, symbol: currencySymbol(code) }));
}
```

`src/features/settings/actions.ts` — `frankfurterUrl` now takes the catalog:

```ts
import { listCurrencies } from '@features/currencies/queries';
```

```ts
    const codes = (await listCurrencies(db)).map((r) => r.code);
    const res = await fetch(frankfurterUrl(codes), { signal: AbortSignal.timeout(8000) });
```

`src/features/recurring/rates.ts` at lines 30 and 55, `src/features/recurring/rule-form.ts` at line 108, `EntryForm.tsx` at 117, `Keypad.tsx` at 121, and `RuleKeypad.tsx` at 101 all pass their code set through the same way. For the three components, the set comes from the hook that already loads keypad data (`use-new-entry.ts` / `use-edit-entry.ts` / `use-edit-rule.ts` already return `ratesAsOf`; add `currencyCodes` alongside it). `EntryForm.tsx:117` maps over the loaded list instead of `CURRENCIES`.

For `rates.ts:55`, which currently throws on an unknown code, keep the throw but take the set as a parameter:

```ts
export function resolveRate(code: string, rates: FxRates, validCodes: Set<string>): number {
  if (!isCurrency(code, validCodes)) throw new Error(`resolveRate: unknown currency "${code}"`);
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Run the gates**

```bash
npm run format:files src/features/entries/entry-form.ts src/features/entries/entry-form.test.ts src/features/entries/keypad-lists.ts src/features/settings/actions.ts src/features/recurring/rates.ts src/features/recurring/rule-form.ts src/features/entries/ui/EntryForm.tsx src/features/entries/ui/Keypad.tsx src/features/recurring/ui/RuleKeypad.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(features): validate currencies against the catalog, not a const" -m "CURRENCIES was a compile-time union, so a code could only be added by editing source and redeploying. Validation now runs against the currencies table, and the keypad picker and ECB fetch read the same list." -m "parseEntryForm and parseRuleForm take the valid-code set as a parameter so they stay pure and DB-free; Currency becomes string, which is the honest type for a value the user controls."
```

---

### Task 5: Disambiguate foreign currency symbols

**Files:**
- Modify: `src/features/entries/trips.ts:81-87`
- Modify: `src/features/entries/trips.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `formatForeign` unchanged in signature; output changes for HKD/SGD/TWD.

- [ ] **Step 1: Write the failing test**

Add to `src/features/entries/trips.test.ts`:

```ts
describe('formatForeign', () => {
  it('keeps the yen and won glyphs', () => {
    expect(formatForeign(1234, 'JPY')).toContain('¥');
    expect(formatForeign(1234, 'KRW')).toContain('₩');
  });

  it('distinguishes Hong Kong dollars from US dollars', () => {
    expect(formatForeign(108, 'HKD')).not.toEqual(formatForeign(108, 'USD'));
    expect(formatForeign(108, 'HKD')).toContain('HK$');
  });

  it('falls back to the code for a currency with no symbol', () => {
    expect(formatForeign(108, 'MOP')).toContain('MOP');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/trips.test.ts`
Expected: FAIL — under `narrowSymbol`, HKD and USD both render `$108`.

- [ ] **Step 3: Write the implementation**

In `src/features/entries/trips.ts`, change `formatForeign`:

```ts
// 'symbol', not 'narrowSymbol': narrowSymbol collapses HKD, USD, SGD and TWD all to a bare "$", so a
// HK$108 metro fare and a US$108 subscription render identically. 'symbol' yields HK$/NT$/SGD and
// keeps ¥ and ₩. THB keeps narrowSymbol in shared/money.ts — it is the home currency, unambiguous,
// and "THB 108" would be a regression there.
export function formatForeign(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    maximumFractionDigits: 0,
  }).format(amount);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/entries/trips.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the gates**

```bash
npm run format:files src/features/entries/trips.ts src/features/entries/trips.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/trips.ts src/features/entries/trips.test.ts
git commit -m "fix(features): distinguish HK\$ from US\$ on the trips list" -m "narrowSymbol renders HKD, USD, SGD and TWD as a bare \$, so a Hong Kong trip and a US subscription were visually identical. 'symbol' gives HK\$/NT\$ and keeps ¥ and ₩; THB keeps narrowSymbol as the home currency."
```

---

### Task 6: Backup v4 carries the currency catalog

**Files:**
- Modify: `src/features/settings/catalog.ts:20-56,60-190`
- Modify: `src/features/settings/catalog.test.ts`
- Modify: `src/features/settings/backup-payload.ts:21-44`
- Modify: `src/features/settings/restore.ts:17-63`
- Modify: `src/features/currencies/queries.ts` (add `getCurrencyCatalog` + `restoreCurrencyCatalog`)

**Interfaces:**
- Consumes: `listAllCurrencies` from Task 2.
- Produces:
  - `type CurrencyCatalogRow = { code: string; offBudget: boolean; sortOrder: number | null; archived: boolean }`
  - `CatalogData.version: 1 | 2 | 3 | 4`, `CatalogData.currencies?: CurrencyCatalogRow[]`
  - `getCurrencyCatalog(db: Db): Promise<CurrencyCatalogRow[]>`
  - `restoreCurrencyCatalog(db: Db, rows: CurrencyCatalogRow[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

Add to `src/features/settings/catalog.test.ts`:

```ts
it('round-trips a v4 backup carrying the currency catalog', () => {
  const data: CatalogData = {
    version: 4,
    categories: [],
    accounts: [],
    recurrences: [],
    currencies: [
      { code: 'THB', offBudget: false, sortOrder: 0, archived: false },
      { code: 'JPY', offBudget: true, sortOrder: 1, archived: false },
      { code: 'GBP', offBudget: false, sortOrder: null, archived: true },
    ],
  };
  expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
});

it('still parses a v3 backup with no currencies key', () => {
  const data: CatalogData = { version: 3, categories: [], accounts: [], recurrences: [] };
  expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
});

it('rejects a currencies array whose rows are misshaped', () => {
  const text = JSON.stringify({
    version: 4,
    categories: [],
    accounts: [],
    recurrences: [],
    currencies: [{ code: 'JPY' }],
  });
  expect(parseCatalogJson(text)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/settings/catalog.test.ts`
Expected: FAIL — `version: 4` is not assignable, and `parseCatalogJson` returns null for it.

- [ ] **Step 3: Extend the catalog type and parser**

In `src/features/settings/catalog.ts`, add the row type next to `BudgetCatalogRow`:

```ts
// One currency for backup. `offBudget` marks "spending in this currency means I am abroad", which is
// configuration the user set by hand — losing it on a fresh-device restore would silently put every
// past and future trip back inside the monthly budget.
export type CurrencyCatalogRow = {
  code: string;
  offBudget: boolean;
  sortOrder: number | null;
  archived: boolean;
};
```

Widen the version and add the optional key:

```ts
export type CatalogData = {
  version: 1 | 2 | 3 | 4;
  categories: CategoryCatalogRow[];
  accounts: AccountCatalogRow[];
  recurrences: RuleCatalogRow[];
  entriesCsv?: string;
  budgets?: BudgetCatalogRow[];
  settings?: SettingRow[];
  // v4 only: the currency catalog. Optional so every older file still parses.
  currencies?: CurrencyCatalogRow[];
};
```

Add the validator:

```ts
function isCurrencyRow(v: unknown): v is CurrencyCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'code' in v &&
    typeof v.code === 'string' &&
    'offBudget' in v &&
    typeof v.offBudget === 'boolean' &&
    'sortOrder' in v &&
    isNumOrNull(v.sortOrder) &&
    'archived' in v &&
    typeof v.archived === 'boolean'
  );
}
```

In `parseCatalogJson`, widen the version guard, parse the key, and widen the literal narrowing:

```ts
  if (
    !('version' in parsed) ||
    (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4)
  )
    return null;
```

```ts
  let currencyRows: CurrencyCatalogRow[] | undefined;
  if ('currencies' in parsed) {
    if (!Array.isArray(parsed.currencies) || !parsed.currencies.every(isCurrencyRow)) return null;
    currencyRows = parsed.currencies;
  }
```

```ts
  // A clean 1 | 2 | 3 | 4 literal without a cast (the guard above proved it is one of them).
  const version =
    parsed.version === 1 ? 1 : parsed.version === 2 ? 2 : parsed.version === 3 ? 3 : 4;
```

```ts
    ...(settingsRows === undefined ? {} : { settings: settingsRows }),
    ...(currencyRows === undefined ? {} : { currencies: currencyRows }),
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/settings/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the catalog queries**

Append to `src/features/currencies/queries.ts`:

```ts
import type { CurrencyCatalogRow } from '@features/settings/catalog';

// Every currency including archived ones — a backup that dropped archived rows would resurrect them
// as active on restore.
export async function getCurrencyCatalog(db: Db): Promise<CurrencyCatalogRow[]> {
  const rows = await listAllCurrencies(db);
  return rows.map((r) => ({
    code: r.code,
    offBudget: r.offBudget === 1,
    sortOrder: r.sortOrder,
    archived: r.archived === 1,
  }));
}

// MERGE, like every other catalog restore: upsert by code, never delete. A currency the user added on
// another device arrives; one only this device knows about survives.
export async function restoreCurrencyCatalog(
  db: Db,
  rows: CurrencyCatalogRow[],
): Promise<void> {
  for (const r of rows) {
    const values = {
      code: r.code,
      offBudget: r.offBudget ? 1 : 0,
      sortOrder: r.sortOrder,
      archived: r.archived ? 1 : 0,
    };
    await db
      .insert(currencies)
      .values(values)
      .onConflictDoUpdate({
        target: currencies.code,
        set: { offBudget: values.offBudget, sortOrder: values.sortOrder, archived: values.archived },
      })
      .run();
  }
}
```

- [ ] **Step 6: Write and restore the new key**

In `src/features/settings/backup-payload.ts`, add to the `Promise.all` and the payload:

```ts
import { getCurrencyCatalog } from '@features/currencies/queries';
```

```ts
  const [rows, categories, accounts, recurrences, budgets, settings, currencyRows] =
    await Promise.all([
      // …existing…
      getAllSettings(db),
      getCurrencyCatalog(db),
    ]);
  const text = serializeCatalogJson({
    version: 4,
    categories,
    accounts,
    recurrences,
    entriesCsv: serializeMonefyCsv(rows),
    budgets,
    settings,
    currencies: currencyRows,
  });
```

In `src/features/settings/restore.ts`, restore before entries (so an entry's currency already exists in the catalog):

```ts
import { restoreCurrencyCatalog } from '@features/currencies/queries';
```

```ts
  await restoreCategoryCatalog(db, data.categories);
  await restoreAccountCatalog(db, data.accounts);
  if (data.currencies !== undefined) await restoreCurrencyCatalog(db, data.currencies);
```

- [ ] **Step 7: Write a restore round-trip test**

Add to `src/features/currencies/queries.test.ts`:

```ts
it('merges a restored catalog without deleting local currencies', async () => {
  await addCurrency(db, 'TWD');
  await restoreCurrencyCatalog(db, [
    { code: 'JPY', offBudget: true, sortOrder: 1, archived: false },
    { code: 'VND', offBudget: true, sortOrder: 9, archived: false },
  ]);
  const codes = await getCurrencyCodes(db);
  expect(codes.has('TWD')).toBe(true);
  expect(codes.has('VND')).toBe(true);
  expect(await getTravelCurrencies(db)).toContain('VND');
});
```

- [ ] **Step 8: Run the full suite and gates**

```bash
npm test
npm run format:files src/features/settings/catalog.ts src/features/settings/catalog.test.ts src/features/settings/backup-payload.ts src/features/settings/restore.ts src/features/currencies/queries.ts src/features/currencies/queries.test.ts
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(features): carry the currency catalog through backup v4" -m "off_budget per currency is hand-set configuration. Without it in the backup a fresh-device restore would silently put every trip back inside the monthly budget — the same failure off_budget on categories had before v1.8.1, and one that only shows up in the exact situation a backup exists for." -m "Optional key, so v1/v2/v3 files still parse; restore merges by code and never deletes."
```

---

### Task 7: The `/currency` page

**Files:**
- Create: `src/app/currency/page.tsx`
- Create: `src/features/currencies/use-currencies.ts`
- Create: `src/features/currencies/use-currencies.test.ts`
- Create: `src/features/currencies/actions.ts`
- Create: `src/features/currencies/addable.ts`
- Create: `src/features/currencies/addable.test.ts`
- Modify: `src/shared/ui/MoreSheet.tsx` (add the entry point)

**Interfaces:**
- Consumes: `listAllCurrencies`, `addCurrency`, `setCurrencyOffBudget`, `setCurrencyArchived` from Task 2; `getFxRates` from `@features/settings/queries`.
- Produces: `addableCurrencies(existing: Set<string>): string[]`; `useCurrencies(): { ready: boolean; data: CurrencyPageData | null }`; `addCurrencyAction`, `setCurrencyOffBudgetAction`, `setCurrencyArchivedAction`.

- [ ] **Step 1: Write the failing test for the pure part**

Create `src/features/currencies/addable.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addableCurrencies } from './addable';

describe('addableCurrencies', () => {
  it('offers ISO codes that are not already in the catalog', () => {
    const list = addableCurrencies(new Set(['THB', 'JPY']));
    expect(list).toContain('TWD');
    expect(list).not.toContain('THB');
    expect(list).not.toContain('JPY');
  });

  it('returns codes in alphabetical order', () => {
    const list = addableCurrencies(new Set());
    expect([...list].sort()).toEqual(list);
  });

  it('never offers a code Intl cannot format', () => {
    for (const code of addableCurrencies(new Set())) {
      expect(() =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(1),
      ).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/currencies/addable.test.ts`
Expected: FAIL — cannot resolve `./addable`.

- [ ] **Step 3: Write the pure helper**

Create `src/features/currencies/addable.ts`:

```ts
// The codes the "add a currency" picker offers: every ISO 4217 code the runtime knows, minus the ones
// already in the catalog. Intl.supportedValuesOf is the list, so a picked code is guaranteed
// formattable and no hand-maintained table can drift from it.
export function addableCurrencies(existing: Set<string>): string[] {
  return Intl.supportedValuesOf('currency')
    .filter((code) => !existing.has(code))
    .sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/currencies/addable.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the hook test**

Create `src/features/currencies/use-currencies.test.ts` following the shape of an existing `renderHook` test in the repo (for example `src/features/budgets/use-budgets-page.test.ts`) — mock `getBrowserDb` the same way that file does, seed a db with `ensureCurrenciesTable`, and assert:

```ts
it('starts not ready, then returns the seeded catalog', async () => {
  const { result } = renderHook(() => useCurrencies());
  expect(result.current.ready).toBe(false);
  await waitFor(() => expect(result.current.ready).toBe(true));
  const codes = result.current.data?.rows.map((r) => r.code) ?? [];
  expect(codes[0]).toBe('THB');
  expect(codes).toContain('MOP');
});

it('exposes the fx rate and its asOf date per currency', async () => {
  const { result } = renderHook(() => useCurrencies());
  await waitFor(() => expect(result.current.ready).toBe(true));
  const jpy = result.current.data?.rows.find((r) => r.code === 'JPY');
  expect(jpy).toBeDefined();
});
```

- [ ] **Step 6: Write the hook and actions**

Create `src/features/currencies/use-currencies.ts`. Note the hook reads through `withDb` from
`@shared/db-effect` — that is the established read-hook pattern in this repo (see
`use-budgets-page.ts:35`), not a direct `getBrowserDb()` call. Write actions do use `getBrowserDb()`
directly, matching `settings/actions.ts`.

```ts
'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { useDataVersion } from '@shared/data-version';
import { currencySymbol } from '@shared/money';
import { getCurrencyCounts } from '@features/entries/queries';
import { getFxRates } from '@features/settings/queries';
import { listAllCurrencies } from './queries';
import { addableCurrencies } from './addable';

export type CurrencyPageRow = {
  code: string;
  offBudget: boolean;
  archived: boolean;
  symbol: string;
  thbPerUnit: number | null;
  asOf: string | null;
  entryCount: number;
};
export type CurrencyPageData = { rows: CurrencyPageRow[]; addable: string[] };

// The /currency page's data. entryCount rides along so the page can warn before archiving a currency
// that still has history — archiving is reversible, but doing it blind to 478 JPY rows is not obvious.
export function useCurrencies(): { ready: boolean; data: CurrencyPageData | null } {
  const [data, setData] = useState<CurrencyPageData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [catalog, rates, counts] = await Promise.all([
        listAllCurrencies(db),
        getFxRates(db),
        getCurrencyCounts(db),
      ]);
      const countByCode = new Map(counts.map((c) => [c.currency, c.count]));
      const rows = catalog.map((r) => {
        const rate = rates[r.code];
        return {
          code: r.code,
          offBudget: r.offBudget === 1,
          archived: r.archived === 1,
          symbol: currencySymbol(r.code),
          thbPerUnit: rate === undefined ? null : rate.thbPerUnit,
          asOf: rate === undefined ? null : rate.asOf,
          entryCount: countByCode.get(r.code) ?? 0,
        };
      });
      setData({ rows, addable: addableCurrencies(new Set(catalog.map((r) => r.code))) });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
```

If `getCurrencyCounts` returns a shape other than `{ currency, count }`, adapt the two lines that
read it rather than changing the query — it is already used by `keypad-lists.ts`.

Create `src/features/currencies/actions.ts` following `src/features/settings/actions.ts`: each is a plain async function that opens `getBrowserDb()`, calls the query, and ends with `bumpDataVersion()`.

```ts
'use client';

import { getBrowserDb } from '@db/browser';
import { bumpDataVersion } from '@shared/data-version';
import { addCurrency, setCurrencyOffBudget, setCurrencyArchived } from './queries';

export async function addCurrencyAction(code: string): Promise<void> {
  const db = await getBrowserDb();
  await addCurrency(db, code);
  bumpDataVersion();
}

export async function setCurrencyOffBudgetAction(code: string, offBudget: boolean): Promise<void> {
  const db = await getBrowserDb();
  await setCurrencyOffBudget(db, code, offBudget);
  bumpDataVersion();
}

export async function setCurrencyArchivedAction(code: string, archived: boolean): Promise<void> {
  const db = await getBrowserDb();
  await setCurrencyArchived(db, code, archived);
  bumpDataVersion();
}
```

- [ ] **Step 7: Write the page**

Create `src/app/currency/page.tsx`. Follow `src/app/settings/page.tsx` for the `<section className="panel">` markup and `src/app/categories/page.tsx` for list-with-controls layout. Every tappable target gets the `.tap` class (44px minimum). Skeleton:

```tsx
'use client';

import { useCurrencies } from '@features/currencies/use-currencies';
import {
  addCurrencyAction,
  setCurrencyOffBudgetAction,
  setCurrencyArchivedAction,
} from '@features/currencies/actions';
import { PageContainer } from '@shared/ui/PageContainer';

export default function CurrencyPage() {
  const { ready, data } = useCurrencies();

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div className="grid h-32 place-items-center text-sm" style={{ color: 'var(--color-muted)' }}>
          …
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Currencies</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Which currencies the keypad offers, and which of them mean you are travelling.
        </p>
      </header>

      <section className="panel flex flex-col gap-3 p-5">
        {data.rows.map((row) => (
          <div key={row.code} className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-medium">
                {row.symbol} {row.code}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {row.thbPerUnit === null
                  ? 'no cached rate'
                  : `฿${row.thbPerUnit.toFixed(4)} · ${row.asOf ?? ''}`}
                {row.entryCount > 0 ? ` · ${row.entryCount} entries` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="tap flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.offBudget}
                  onChange={(e) => void setCurrencyOffBudgetAction(row.code, e.target.checked)}
                />
                Off budget
              </label>
              <button
                type="button"
                className="tap text-sm"
                onClick={() => void setCurrencyArchivedAction(row.code, !row.archived)}
              >
                {row.archived ? 'Restore' : 'Hide'}
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-medium">Add a currency</h2>
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Spending in an off-budget currency is travel, and is left out of budget meters. Currencies
          you only use for online purchases should stay on budget.
        </p>
        <select
          className="tap"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value !== '') void addCurrencyAction(e.target.value);
          }}
        >
          <option value="" disabled>
            Choose a code…
          </option>
          {data.addable.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </section>
    </PageContainer>
  );
}
```

Style the checkbox and buttons to match the existing controls in `settings/page.tsx` rather than leaving them browser-default; the skeleton above is structure, not final styling.

- [ ] **Step 8: Link it from the More sheet**

In `src/shared/ui/MoreSheet.tsx`, add a `/currency` tile alongside the existing Settings/Categories/Accounts entries, matching their icon + label pattern.

- [ ] **Step 9: Run the gates**

```bash
npm run format:files src/app/currency/page.tsx src/features/currencies/ src/shared/ui/MoreSheet.tsx
npm run typecheck
npm run lint
npm run format:check
npm test
```

- [ ] **Step 10: Verify in a browser at 412px**

```bash
npm run dev:web
```

Open `http://127.0.0.1:4010/currency`. Confirm: THB is first; MOP is present; toggling "Off budget" on JPY persists across a reload; adding TWD makes it appear in the keypad's currency picker; archiving GBP removes it from the keypad but leaves it listed on this page. Then open `/budgets` and confirm a cycle containing JPY entries no longer counts them against the meters.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(app): add the currency page" -m "Lists the catalog with its cached ECB rate, lets a code be toggled off-budget, archived, or added from a picker over Intl.supportedValuesOf — 162 ISO codes, so a picked code is always formattable." -m "This is the surface that makes the catalog editable from the phone, which was the whole point: a currency is needed exactly when you are somewhere you did not plan to be."
```

---

### Task 8: Release notes and CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (architecture section)
- Modify: `CHANGELOG.md` if the repo has one

- [ ] **Step 1: Update the architecture map**

In `CLAUDE.md`, add `currencies/` to the `src/features/` tree with a one-line description, and update the two places that say the DDL is "seven-table" to "eight-table".

```
│   ├── currencies/         # the currency catalog: codes, per-currency off-budget flag, /currency page
```

- [ ] **Step 2: Update the schema-lockstep note**

In the "Toolchain notes" section, the bullet that begins "**Schema lives in TWO places**" already describes the rule. Add the currencies table to its example list if it names tables.

- [ ] **Step 3: Run the gates**

```bash
npm run format:files CLAUDE.md
npm run format:check
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the currencies feature" -m "New feature directory and an eighth bootstrap table, both of which the architecture map and the lockstep note need to name."
```

---

## Follow-ups deliberately out of scope

- **The `เยน …` → home-category data merge (v9).** Data work on the backup file, not code. Do it after this branch ships so the travel-currency off-budget rule is already live when Japan spend lands in `อาหาร` — otherwise six historical trips blow the budget meters.
- **`/report` currency filter.** Without it, merging `เยน อาหาร` into `อาหาร` loses the "Japan food over time" series. Worth its own small plan.
- **Category archive UI.** `categories.archived` and `accounts.archived` ship inert (`src/features/categories/schema.ts:8-10`). The list/toggle/archive shapes built in Task 7 apply directly.
- **Moving `card_fx_fee_pct` and the FX-rate refresh from `/settings` to `/currency`.** Only worth doing if `/settings` feels crowded once this lands.
