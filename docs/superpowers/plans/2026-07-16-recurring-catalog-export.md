# Recurring rules in the catalog backup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold recurring rules into the existing category/account catalog backup — export their definition, and restore them fresh (insert-if-name-absent) alongside categories and accounts from one file.

**Architecture:** The catalog JSON gains a `recurrences` array and its `version` goes 1 → 2 (parser stays backward-compatible with v1 files). Export carries a rule's DEFINITION only (drops `lastPosted`/`startDate`/`startSeq`); a yearly rule's renewal month rides along as an explicit `month` field. Import inserts a rule only if no rule of that name exists, computing a fresh `startDate` from today so it never back-posts history.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless relative imports) · drizzle-orm query builder · better-sqlite3 via `makeNodeProxyDb` (tests) · Vitest · Next.js 16 static export.

## Global Constraints

- **TypeScript bans (ESLint errors):** no `any`, no `as` casts, no `!` assertions, no `@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`. `as const` allowed. `type` aliases, never `interface`. `for..of` over `.forEach`.
- **Catalog `version` becomes `1 | 2`.** Export always writes `2`. `parseCatalogJson` accepts BOTH; a v1 file (or one omitting `recurrences`) parses with `recurrences: []` — this is the backward-compat guarantee, do not break it.
- **Reset semantics:** an imported rule gets `lastPosted = null` (schema default), `startSeq = 1`, `startDate` = next occurrence from today. Never carry the source's pointer.
- **Import is insert-if-name-absent:** skip a rule whose name already exists (archived or not); never update or delete an existing rule. Non-destructive and idempotent, like the catalog's category/account upsert.
- **Category/account by NAME**, resolved via `categoryIdFor`/`accountIdFor` (which create a missing one), exactly as `EntryInput` does. Restore order: categories → accounts → rules.
- **Only active (non-archived) rules export.**
- **Dates:** `Intl.DateTimeFormat('en-CA', ...)` policy; the next-occurrence math reuses `clampDay` from `schedule.ts`. `todayIso()` is Bangkok-tz from `@shared/date`.
- **Quality gates before every commit** (run separately): `npm run format:files <changed>`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. Full suite is currently **494** green.
- **Commit** with repeated `-m` flags only — never `git commit -F` or a heredoc (the wrapped git gets no stdin; the hook rejects an empty message). Scopes: `features`, `app`.
- **Branch:** `feat/recurring-records` (current).

## File Structure

| File | Change |
| --- | --- |
| `src/features/recurring/schedule.ts` | **Modify** — export `nextOccurrence` (moved from rule-form) |
| `src/features/recurring/schedule.test.ts` | **Modify** — direct test for `nextOccurrence` |
| `src/features/recurring/rule-form.ts` | **Modify** — import `nextOccurrence` instead of defining it |
| `src/features/settings/catalog.ts` | **Modify** — `RuleCatalogRow` + guard; `recurrences` on `CatalogData`; version `1 \| 2` |
| `src/features/settings/catalog.test.ts` | **Modify** — v2 round-trip, v1 back-compat, malformed rule → null |
| `src/features/recurring/queries.ts` | **Modify** — `getRuleCatalog` + `restoreRecurrencesFromCatalog` |
| `src/features/recurring/queries.test.ts` | **Modify** — export shape + restore/idempotence/skip |
| `src/features/settings/use-backup-data.ts` | **Modify** — read + include `recurrences` in the export |
| `src/features/settings/ui/ImportCatalog.tsx` | **Modify** — restore rules after accounts |

---

### Task 1: Extract `nextOccurrence` into schedule.ts

`rule-form.ts` has a private `nextOccurrence`. The import path needs the same math, so move it to `schedule.ts` (it already depends only on `clampDay`, which lives there) and have both call sites share one copy.

**Files:**
- Modify: `src/features/recurring/schedule.ts`
- Modify: `src/features/recurring/schedule.test.ts`
- Modify: `src/features/recurring/rule-form.ts`

**Interfaces:**
- Produces: `nextOccurrence(day: number, month: number | null, todayIso: string, intervalMonths: number): string` — exported from `./schedule`. `month` null = monthly (this month's `day` or next month's); a month given with `intervalMonths === 12` = yearly (this year's `month`/`day` or next year's). Pre-clamped for short months.

- [ ] **Step 1: Write the failing test**

Append to `src/features/recurring/schedule.test.ts` (add `nextOccurrence` to the existing import from `./schedule`):

```ts
describe('nextOccurrence', () => {
  it('returns this month when the day has not passed', () => {
    expect(nextOccurrence(20, null, '2026-07-10', 1)).toBe('2026-07-20');
  });
  it('rolls to next month when the day has passed', () => {
    expect(nextOccurrence(5, null, '2026-07-10', 1)).toBe('2026-08-05');
  });
  it('returns today when the day IS today', () => {
    expect(nextOccurrence(10, null, '2026-07-10', 1)).toBe('2026-07-10');
  });
  it('clamps a 31st monthly rule to a short month', () => {
    expect(nextOccurrence(31, null, '2026-02-01', 1)).toBe('2026-02-28');
  });
  it('rolls a monthly December day into next January', () => {
    expect(nextOccurrence(5, null, '2026-12-10', 1)).toBe('2027-01-05');
  });
  it('returns this year for a yearly rule whose month is ahead', () => {
    expect(nextOccurrence(5, 3, '2026-01-10', 12)).toBe('2026-03-05');
  });
  it('rolls a yearly rule to next year when its month has passed', () => {
    expect(nextOccurrence(5, 3, '2026-07-10', 12)).toBe('2027-03-05');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/recurring/schedule.test.ts`
Expected: FAIL — `nextOccurrence` is not exported from `./schedule`.

- [ ] **Step 3: Move `nextOccurrence` into schedule.ts**

In `src/features/recurring/schedule.ts`, add this exported function (place it after `clampDay`, which it calls):

```ts
// The next time (month, day) comes around, at or after today. `month` null = monthly, so the next
// occurrence is this month or the next one; a month given (with intervalMonths 12) = yearly, so it is
// this year or the next. Pre-clamped, so a 31st rule landing in February returns '2026-02-28' while
// `day` stays 31 — which is what lets a later step return to the 31st in March. Shared by the rule
// form (a new/edited rule's first due date) and the catalog import (a restored rule's fresh anchor).
export function nextOccurrence(
  day: number,
  month: number | null,
  todayIso: string,
  intervalMonths: number,
): string {
  const [y, m] = todayIso.split('-').map(Number);
  if (intervalMonths === 12 && month !== null) {
    const thisYear = clampDay(y, month, day);
    return thisYear >= todayIso ? thisYear : clampDay(y + 1, month, day);
  }
  const thisMonth = clampDay(y, m, day);
  if (thisMonth >= todayIso) return thisMonth;
  const total = y * 12 + (m - 1) + 1;
  return clampDay(Math.floor(total / 12), (total % 12) + 1, day);
}
```

- [ ] **Step 4: Delete the private copy in rule-form.ts and import it**

In `src/features/recurring/rule-form.ts`:
1. Delete the private `function nextOccurrence(...) { ... }` block (the one with the comment "The next time (month, day) comes around…").
2. Add to the top imports, alongside `import { clampDay } from './schedule';`:

```ts
import { clampDay, nextOccurrence } from './schedule';
```

`resolveStartDate` in the same file already calls `nextOccurrence(...)` with the matching argument order — leave those call sites unchanged. (`clampDay` stays imported; `resolveStartDate` still uses it indirectly via `nextOccurrence` only, so if the lint flags `clampDay` as unused, drop it from the import — check by running lint in Step 5.)

- [ ] **Step 5: Run tests + gates**

Run: `npm test -- src/features/recurring/schedule.test.ts src/features/recurring/rule-form.test.ts`
Expected: PASS — the new `nextOccurrence` block AND all existing `rule-form` tests (they exercise `resolveStartDate` → `nextOccurrence`, proving the move is behaviour-preserving).

Then:
```
npm run format:files src/features/recurring/schedule.ts src/features/recurring/schedule.test.ts src/features/recurring/rule-form.ts
npm run typecheck && npm run lint && npm run format:check && npm test
```
If lint reports `clampDay` unused in `rule-form.ts`, change its import to `import { nextOccurrence } from './schedule';` and re-run.

- [ ] **Step 6: Commit**

```
git add src/features/recurring/schedule.ts src/features/recurring/schedule.test.ts src/features/recurring/rule-form.ts
git commit -m "refactor(features): move nextOccurrence into schedule.ts" -m "The catalog import needs the same 'first due date from today' math the rule form uses. Moving it to schedule.ts (where its only dependency, clampDay, already lives) lets both compute the anchor from one implementation rather than duplicating it." -m "Pure move — the rule-form tests exercise it through resolveStartDate and stay green, proving behaviour is unchanged."
```

---

### Task 2: Catalog v2 — `RuleCatalogRow` + backward-compatible parser

**Files:**
- Modify: `src/features/settings/catalog.ts`
- Modify: `src/features/settings/catalog.test.ts`

**Interfaces:**
- Produces:
  - `type RuleCatalogRow = { name: string; category: string; account: string; amount: number; currency: string | null; rate: number | null; day: number; intervalMonths: number; month: number | null; totalCount: number | null }`
  - `type CatalogData` now `{ version: 1 | 2; categories: CategoryCatalogRow[]; accounts: AccountCatalogRow[]; recurrences: RuleCatalogRow[] }`
  - `serializeCatalogJson(data: CatalogData): string` (unchanged signature)
  - `parseCatalogJson(text: string): CatalogData | null` — accepts version 1 or 2; `recurrences` defaults to `[]`

- [ ] **Step 1: Write the failing tests**

In `src/features/settings/catalog.test.ts`, add a sample rule to the existing `sample` object's shape and new cases. Add these tests (adapt the existing `sample` const to include `recurrences`):

```ts
const sampleRule = {
  name: 'Netflix',
  category: 'Streaming',
  account: 'Visa',
  amount: 9.99,
  currency: 'USD',
  rate: null,
  day: 5,
  intervalMonths: 1,
  month: null,
  totalCount: null,
};

describe('catalog v2 with recurrences', () => {
  it('round-trips a rule through serialize → parse', () => {
    const data = {
      version: 2 as const,
      categories: [],
      accounts: [],
      recurrences: [sampleRule],
    };
    expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
  });

  it('round-trips a yearly rule that carries a month', () => {
    const yearly = { ...sampleRule, name: 'Domain', intervalMonths: 12, month: 3 };
    const data = { version: 2 as const, categories: [], accounts: [], recurrences: [yearly] };
    expect(parseCatalogJson(serializeCatalogJson(data))).toEqual(data);
  });

  it('accepts a v1 file (no recurrences key) and yields an empty array — back-compat', () => {
    const v1 = JSON.stringify({ version: 1, categories: [], accounts: [] });
    expect(parseCatalogJson(v1)).toEqual({
      version: 1,
      categories: [],
      accounts: [],
      recurrences: [],
    });
  });

  it('rejects the whole file when a rule row is malformed', () => {
    const bad = JSON.stringify({
      version: 2,
      categories: [],
      accounts: [],
      recurrences: [{ ...sampleRule, amount: 'lots' }],
    });
    expect(parseCatalogJson(bad)).toBeNull();
  });

  it('rejects a version other than 1 or 2', () => {
    expect(parseCatalogJson(JSON.stringify({ version: 3, categories: [], accounts: [] }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/settings/catalog.test.ts`
Expected: FAIL — `recurrences` not on `CatalogData`; v1 file parses to a shape without `recurrences`.

- [ ] **Step 3: Add the type, guard, and version handling**

In `src/features/settings/catalog.ts`:

Add after `AccountCatalogRow`:

```ts
// A recurring rule's DEFINITION for backup — not its runtime state. `lastPosted`, `startDate` and
// `startSeq` are deliberately absent (an imported rule starts fresh from its next due date); a yearly
// rule's renewal month, which otherwise lives only inside startDate, rides along as `month`.
export type RuleCatalogRow = {
  name: string;
  category: string; // by name; resolved to category_id on import
  account: string; // by name; resolved to account_id on import
  amount: number; // positive magnitude
  currency: string | null; // 'USD' etc, or null/'THB'
  rate: number | null; // pinned THB-per-unit, or null for the live rate
  day: number; // 1–31
  intervalMonths: number; // 1 monthly, 12 yearly
  month: number | null; // 1–12 for a yearly rule's renewal month; null for monthly
  totalCount: number | null; // installment length, or null for a subscription
};
```

Change `CatalogData` to:

```ts
export type CatalogData = {
  version: 1 | 2;
  categories: CategoryCatalogRow[];
  accounts: AccountCatalogRow[];
  recurrences: RuleCatalogRow[];
};
```

Add these guards (near the existing `isCategoryRow`/`isAccountRow`; `isNumOrNull` already exists):

```ts
function isStrOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}
function isRuleRow(v: unknown): v is RuleCatalogRow {
  return (
    typeof v === 'object' &&
    v !== null &&
    'name' in v &&
    typeof v.name === 'string' &&
    'category' in v &&
    typeof v.category === 'string' &&
    'account' in v &&
    typeof v.account === 'string' &&
    'amount' in v &&
    typeof v.amount === 'number' &&
    'currency' in v &&
    isStrOrNull(v.currency) &&
    'rate' in v &&
    isNumOrNull(v.rate) &&
    'day' in v &&
    typeof v.day === 'number' &&
    'intervalMonths' in v &&
    typeof v.intervalMonths === 'number' &&
    'month' in v &&
    isNumOrNull(v.month) &&
    'totalCount' in v &&
    isNumOrNull(v.totalCount)
  );
}
```

Replace `parseCatalogJson` with:

```ts
export function parseCatalogJson(text: string): CatalogData | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  if (!('version' in parsed) || (parsed.version !== 1 && parsed.version !== 2)) return null;
  if (!('categories' in parsed) || !Array.isArray(parsed.categories)) return null;
  if (!('accounts' in parsed) || !Array.isArray(parsed.accounts)) return null;
  if (!parsed.categories.every(isCategoryRow)) return null;
  if (!parsed.accounts.every(isAccountRow)) return null;
  // recurrences is absent in a v1 file → []; present → every row must validate. All-or-nothing,
  // exactly like categories/accounts above.
  const rawRec = 'recurrences' in parsed ? parsed.recurrences : [];
  if (!Array.isArray(rawRec) || !rawRec.every(isRuleRow)) return null;
  // A clean 1 | 2 literal without a cast (the guard above proved it is one of them).
  const version = parsed.version === 1 ? 1 : 2;
  return {
    version,
    categories: parsed.categories,
    accounts: parsed.accounts,
    recurrences: rawRec,
  };
}
```

`serializeCatalogJson` is unchanged (it already `JSON.stringify`s whatever `CatalogData` it's given, now including `recurrences`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/settings/catalog.test.ts`
Expected: PASS. Note: any existing test that built a `CatalogData` literal without `recurrences` now needs `recurrences: []` added — update those literals (the compiler/tests will flag them).

- [ ] **Step 5: Gates + commit**

```
npm run format:files src/features/settings/catalog.ts src/features/settings/catalog.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/settings/catalog.ts src/features/settings/catalog.test.ts
git commit -m "feat(features): add recurring rules to the catalog backup format" -m "Catalog version 1 -> 2 with a recurrences array carrying each rule's definition (drops the runtime pointer; a yearly rule's month rides along explicitly). The parser accepts version 1 OR 2 and defaults recurrences to [] when the key is absent, so every backup saved before this feature still restores." -m "A malformed rule row rejects the whole file, matching the all-or-nothing validation the category/account rows already use."
```

---

### Task 3: Query layer — `getRuleCatalog` + `restoreRecurrencesFromCatalog`

**Files:**
- Modify: `src/features/recurring/queries.ts`
- Modify: `src/features/recurring/queries.test.ts`

**Interfaces:**
- Consumes: `RuleCatalogRow` from `@features/settings/catalog` (Task 2); `nextOccurrence` from `./schedule` (Task 1); `categoryIdFor` from `@features/categories/queries`; `accountIdFor` from `@features/accounts/queries`; `categories`/`accounts` tables already imported in this file.
- Produces:
  - `getRuleCatalog(db: Db): Promise<RuleCatalogRow[]>` — active rules, category/account by name, `month` derived from `startDate` for yearly rules.
  - `restoreRecurrencesFromCatalog(db: Db, rows: RuleCatalogRow[], todayIso: string): Promise<void>` — insert-if-name-absent, fresh anchor.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/recurring/queries.test.ts`. It already has a `db()` helper that ensures the entries+recurrences tables (add `ensureCategoriesTable`/`ensureAccountsTable` if the helper doesn't already — they're pulled in by `ensureRecurrencesTable`). Add imports:

```ts
import { getRuleCatalog, restoreRecurrencesFromCatalog } from './queries';
import { categoryIdFor } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import type { RuleCatalogRow } from '@features/settings/catalog';
```

Tests:

```ts
describe('getRuleCatalog', () => {
  it('exports active rules by name, deriving month only for yearly', async () => {
    const d = await db();
    const categoryId = await categoryIdFor(d, 'Streaming');
    const accountId = await accountIdFor(d, 'Visa');
    await addRule(d, {
      name: 'Netflix', day: 5, intervalMonths: 1, categoryId, accountId,
      amount: 9.99, currency: 'USD', startDate: '2026-07-05',
    });
    await addRule(d, {
      name: 'Domain', day: 5, intervalMonths: 12, categoryId, accountId,
      amount: 1200, currency: 'THB', startDate: '2026-03-05',
    });

    const rows = await getRuleCatalog(d);
    expect(rows).toContainEqual(
      expect.objectContaining({ name: 'Netflix', category: 'Streaming', account: 'Visa', month: null }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ name: 'Domain', intervalMonths: 12, month: 3 }),
    );
  });

  it('excludes archived rules', async () => {
    const d = await db();
    const categoryId = await categoryIdFor(d, 'Streaming');
    const accountId = await accountIdFor(d, 'Visa');
    await addRule(d, {
      name: 'Gone', day: 5, intervalMonths: 1, categoryId, accountId,
      amount: 5, currency: 'THB', startDate: '2026-07-05', archived: 1,
    });
    expect(await getRuleCatalog(d)).toEqual([]);
  });
});

describe('restoreRecurrencesFromCatalog', () => {
  const netflix: RuleCatalogRow = {
    name: 'Netflix', category: 'Streaming', account: 'Visa', amount: 9.99,
    currency: 'USD', rate: null, day: 5, intervalMonths: 1, month: null, totalCount: null,
  };

  it('inserts a fresh rule: pointer null, startSeq 1, startDate next occurrence, ids resolved', async () => {
    const d = await db();
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20');
    const [rule] = await listRules(d);
    expect(rule).toMatchObject({
      name: 'Netflix', amount: 9.99, currency: 'USD',
      lastPosted: null, startSeq: 1, startDate: '2026-08-05', // the 5th has passed on the 20th
    });
    // names resolved to real ids
    expect(rule.categoryId).not.toBeNull();
    expect(rule.accountId).not.toBeNull();
  });

  it('reconstructs a yearly rule startDate from its month', async () => {
    const d = await db();
    const domain: RuleCatalogRow = { ...netflix, name: 'Domain', intervalMonths: 12, month: 3, currency: 'THB' };
    await restoreRecurrencesFromCatalog(d, [domain], '2026-07-20');
    const [rule] = await listRules(d);
    expect(rule).toMatchObject({ name: 'Domain', startDate: '2027-03-05' }); // March already passed
  });

  it('is idempotent — a rule whose name exists is skipped', async () => {
    const d = await db();
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20');
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20'); // second import
    expect((await listRules(d)).filter((r) => r.name === 'Netflix')).toHaveLength(1);
  });

  it('auto-creates a missing category and account', async () => {
    const d = await db();
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20');
    const catId = await categoryIdFor(d, 'Streaming'); // already exists now → returns it, no dup
    const [rule] = await listRules(d);
    expect(rule.categoryId).toBe(catId);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/features/recurring/queries.test.ts`
Expected: FAIL — `getRuleCatalog`/`restoreRecurrencesFromCatalog` not exported.

- [ ] **Step 3: Implement the two queries**

In `src/features/recurring/queries.ts`, add imports at the top:

```ts
import { categoryIdFor } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import { nextOccurrence } from './schedule';
import type { RuleCatalogRow } from '@features/settings/catalog';
```

Add the two functions:

```ts
// Active rules as catalog rows: category/account by NAME (innerJoin — a rule always has both; the
// delete guards keep them from being removed while referenced), and a yearly rule's renewal month
// derived from its startDate. Drops the runtime pointer/startDate/startSeq — the backup carries the
// definition, not the progress.
export async function getRuleCatalog(db: Db): Promise<RuleCatalogRow[]> {
  const rows = await db
    .select({
      name: recurrences.name,
      category: categories.name,
      account: accounts.name,
      amount: recurrences.amount,
      currency: recurrences.currency,
      rate: recurrences.rate,
      day: recurrences.day,
      intervalMonths: recurrences.intervalMonths,
      totalCount: recurrences.totalCount,
      startDate: recurrences.startDate,
    })
    .from(recurrences)
    .innerJoin(categories, eq(recurrences.categoryId, categories.id))
    .innerJoin(accounts, eq(recurrences.accountId, accounts.id))
    .where(eq(recurrences.archived, 0))
    .orderBy(recurrences.id)
    .all();
  return rows.map(({ startDate, ...rest }) => ({
    ...rest,
    month: rest.intervalMonths === 12 ? Number(startDate.split('-')[1]) : null,
  }));
}

// Restore rules from a catalog file. Insert-if-name-absent: a rule whose name already exists (archived
// or not) is skipped, never edited or deleted — non-destructive and idempotent, like the catalog's
// category/account upsert. An inserted rule starts FRESH: startSeq 1, lastPosted null (schema
// default), and startDate = its next due date from today, so it never back-posts old months.
// Category/account names resolve (creating a missing one) just as an entry write does.
export async function restoreRecurrencesFromCatalog(
  db: Db,
  rows: RuleCatalogRow[],
  todayIso: string,
): Promise<void> {
  if (rows.length === 0) return;
  const existing = new Set(
    (await db.select({ name: recurrences.name }).from(recurrences).all()).map((r) => r.name),
  );
  for (const row of rows) {
    if (existing.has(row.name)) continue;
    existing.add(row.name); // guard against a file that lists the same name twice
    const categoryId = await categoryIdFor(db, row.category);
    const accountId = await accountIdFor(db, row.account);
    await addRule(db, {
      name: row.name,
      day: row.day,
      intervalMonths: row.intervalMonths,
      categoryId,
      accountId,
      amount: row.amount,
      currency: row.currency,
      rate: row.rate,
      totalCount: row.totalCount,
      startSeq: 1,
      startDate: nextOccurrence(row.day, row.month, todayIso, row.intervalMonths),
    });
  }
}
```

(`addRule`, `listRules`, `recurrences`, `categories`, `accounts`, `eq` are already in this file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/recurring/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates + commit**

```
npm run format:files src/features/recurring/queries.ts src/features/recurring/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/queries.ts src/features/recurring/queries.test.ts
git commit -m "feat(features): read and restore recurring rules for the catalog backup" -m "getRuleCatalog exports active rules by category/account name with a yearly rule's month derived from its startDate. restoreRecurrencesFromCatalog inserts a rule only if no rule of that name exists (idempotent, non-destructive), resolving names to ids and computing a fresh startDate from today so an imported rule starts from its next due date rather than back-posting history." -m "Uses the shared nextOccurrence from schedule.ts, so import and the rule form anchor a new rule identically."
```

---

### Task 4: Wire export + import, and verify in a browser

**Files:**
- Modify: `src/features/settings/use-backup-data.ts`
- Modify: `src/features/settings/ui/ImportCatalog.tsx`

**Interfaces:**
- Consumes: `getRuleCatalog`, `restoreRecurrencesFromCatalog` (Task 3); `todayIso` from `@shared/date`.

- [ ] **Step 1: Include rules in the exported catalog**

In `src/features/settings/use-backup-data.ts`:

1. Add the import:
```ts
import { getRuleCatalog } from '@features/recurring/queries';
```
2. Add `getRuleCatalog(db)` to the `Promise.all` read and destructure it:
```ts
const [rows, categories, accounts, recurrences] = await Promise.all([
  getEntries(db),
  getCategoryCatalog(db),
  getAccountCatalog(db),
  getRuleCatalog(db),
]);
```
3. Change the serialize call to write version 2 with rules:
```ts
        catalog: {
          name: `moniflow-catalog-${day}.txt`,
          type: CATALOG_MIME,
          text: serializeCatalogJson({ version: 2, categories, accounts, recurrences }),
        },
```

(Leave `BackupData`, the CSV path, and the counts as they are — the catalog file simply now carries the rules too. `if (!live) return;` stays before `setData`.)

- [ ] **Step 2: Restore rules on import**

In `src/features/settings/ui/ImportCatalog.tsx`:

1. Add imports:
```ts
import { restoreRecurrencesFromCatalog } from '@features/recurring/queries';
import { todayIso } from '@shared/date';
```
2. In `handleFile`, after `await restoreAccountCatalog(db, data.accounts);`, add:
```ts
      await restoreRecurrencesFromCatalog(db, data.recurrences, todayIso());
```
3. Change the success toast:
```ts
      toast('Categories, accounts & rules restored');
```

- [ ] **Step 3: Gates**

```
npm run format:files src/features/settings/use-backup-data.ts src/features/settings/ui/ImportCatalog.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
npm run build:web
```
Expected: all green; `build:web` produces the static routes.

- [ ] **Step 4: Commit**

```
git add src/features/settings/use-backup-data.ts src/features/settings/ui/ImportCatalog.tsx
git commit -m "feat(app): export and restore recurring rules with the catalog backup" -m "The Settings 'Export categories & accounts' file now carries the active recurring rules too (version 2), and 'Restore' recreates them after categories and accounts, in dependency order. One file, one restore, no new buttons — rules ride along with the config they reference." -m "Restore is insert-if-name-absent, so re-importing adds nothing and an imported rule starts fresh from its next due date."
```

- [ ] **Step 5: Verify in a real browser (controller drives this)**

Tests run against the Node shim, so they never exercise the actual file export/import against OPFS. Drive at 412px on `npm run dev:web` (`127.0.0.1:4010`):

- [ ] Ensure at least one monthly and one yearly rule exist on `/recurring` (create them if needed).
- [ ] Settings → export the catalog (intercept the blob text, or download it). Confirm the JSON has `"version": 2` and a `recurrences` array whose rows carry `category`/`account` NAMES, and the yearly rule carries its `month`.
- [ ] Settings → **Wipe all data** (this also clears rules — Task 9 of the recurring feature). Confirm `/recurring` is empty.
- [ ] Settings → **Restore** the exported file. Toast reads "Categories, accounts & rules restored".
- [ ] `/recurring` shows the rules back, with **fresh** schedules: each rule's chip shows a next-occurrence day (and the yearly its month), progress is `null`/fresh (no installment mid-way), and nothing was back-posted into `/records`.
- [ ] Restore the SAME file again → no duplicate rules appear (idempotence, live).
- [ ] Console has zero errors across the flow.

If a defect surfaces that the tests missed, fix it AND add the test that would have caught it before finishing.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
| --- | --- |
| Fold into catalog, version 1 → 2 | 2 |
| Parser accepts v1 (empty rules) AND v2 | 2 |
| `RuleCatalogRow` shape (drops pointer/startDate/startSeq; keeps `month`) | 2 |
| Export active rules by name, derive `month` | 3 (`getRuleCatalog`) |
| Import insert-if-name-absent, fresh anchor, resolve names | 3 (`restoreRecurrencesFromCatalog`) |
| Restore order categories → accounts → rules | 4 (ImportCatalog) |
| Export includes rules | 4 (use-backup-data) |
| Shared next-occurrence math | 1 (extract) + 3 (consume) |
| Malformed row → whole parse null | 2 (test) |
| Browser round-trip verification | 4 Step 5 |

**Placeholder scan:** none — every step carries complete code or an exact command.

**Type consistency:** `RuleCatalogRow` field names (`name/category/account/amount/currency/rate/day/intervalMonths/month/totalCount`) are identical in the type (Task 2), the query select mapping (Task 3 `getRuleCatalog`), and the `addRule` mapping (Task 3 `restoreRecurrencesFromCatalog`). `nextOccurrence(day, month, todayIso, intervalMonths)` argument order matches between the export in Task 1 and both call sites (rule-form's existing `resolveStartDate`, and Task 3's restore). `CatalogData` gains `recurrences` in Task 2 and is consumed as `data.recurrences` in Task 4.

**Known ceiling carried from spec:** import skips (never updates) an existing rule; two same-named rules can't both import; posting history does not travel — all accepted in the design.
