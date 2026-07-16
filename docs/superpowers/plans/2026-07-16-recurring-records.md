# Recurring Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monthly/yearly subscriptions, bills, and installments post themselves into the ledger on app open, dated their real due date, converted at that date's FX rate, and are managed from a new `/recurring` page.

**Architecture:** One new table (`recurrences`) holding rules, plus a **single mutable pointer** per rule (`last_posted`) from which the payment number, paid count, and remaining count are all *derived* — never stored. A pure `schedule.ts` computes due dates; a `sweep.ts` runs once per session from the app shell and inserts ordinary `entries` rows, so every existing read surface (donut, breakdown, records, search, budgets, trips, CSV export) works with **zero read-path changes**.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless relative imports) · drizzle-orm query builder · `@sqlite.org/sqlite-wasm` (browser/OPFS, shipping) · better-sqlite3 via `makeNodeProxyDb` (tests only) · Vitest · Next.js 16 App Router (`output: 'export'`, every page `'use client'`) · React 19 · Tailwind v4.

## Global Constraints

- **TypeScript bans, enforced as ESLint errors:** no `any`, no `as` casts, no `!` assertions, no `@ts-ignore`/`@ts-nocheck`/`@ts-expect-error`. `as const` IS allowed. Use `type` aliases, never `interface`. Prefer `for..of` over `.forEach`.
- **Narrow `string` → `Currency` with the existing exported guard** `isCurrency(value: string): value is Currency` from `@features/entries/entry-form`. Never cast.
- **The DDL lives in TWO places and must stay in lockstep:** each feature's `schema.ts` AND `BOOTSTRAP_SQL` in `src/db/worker.ts`. Missing the second passes every test and breaks the real browser.
- **The ledger stores expenses as NEGATIVE amounts.** `originalAmount` is stored **signed, same sign as `amount`** (confirmed: `entry-form.ts:62` writes `originalAmount: sign * amount`). A recurring rule stores `amount` POSITIVE; the sweep negates both.
- **Reads are async and post-mount.** Every read hook returns `{ ready, data }`. Every write ends in `bumpDataVersion()` from `@shared/data-version`.
- **Path aliases:** `@db/*`, `@features/*`, `@shared/*`.
- **Money formatters by provenance:** `formatBaht` for computed/stored figures, `formatBahtWhole` for glance figures. From `@shared/money`.
- **Dates:** `Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })` → `YYYY-MM-DD` for DB date keys. Never `toISOString().split('T')[0]`. Never string-manipulate dates.
- **Quality gates before every commit** (run separately so failures surface individually):
  ```bash
  npm run format:files <changed files>
  npm run typecheck
  npm run lint
  npm run format:check
  npm test
  ```
- **Commit format:** `type(scope): description` + body explaining WHY. Scopes here: `db`, `features`, `app`, `shared`. Use repeated `-m` flags — **never** `git commit -F` or a heredoc (the wrapped git never receives stdin and the commit-msg hook rejects it as empty).
- **Branch:** `feat/recurring-records` (already created, spec committed at `d5e2d21`).

## File Structure

**Create — `src/features/recurring/`:**

| File | Responsibility |
| --- | --- |
| `schema.ts` | drizzle table + `ensureRecurrencesTable(db)` |
| `schedule.ts` | **Pure** date/sequence math. No DB, no network, no React. Carries the test weight. |
| `schedule.test.ts` | Leap years, day-31 clamping, yearly interval, installment exhaustion, catch-up, idempotence |
| `queries.ts` | Typed reads/writes: list/add/update/archive, `markPosted`, `rewindRecurrences`, `postRecurringEntries` |
| `queries.test.ts` | Against the Node shim |
| `rates.ts` | `resolveRate(db, rule, date)` — pinned → THB → historical fetch → cached fallback |
| `rates.test.ts` | Mocked `fetch` |
| `sweep.ts` | `runSweep(db, todayIso)` — the scheduler |
| `sweep.test.ts` | Node shim + mocked fetch |
| `use-recurring-sweep.ts` + `.test.ts` | Memoized once-per-session hook for the shell |
| `use-recurring.ts` + `.test.ts` | Read hook for the page |
| `rule-form.ts` + `.test.ts` | Pure `FormData` → rule parser |
| `actions.ts` | Client write layer, each ending in `bumpDataVersion()` |
| `ui/RecurringList.tsx`, `ui/RuleForm.tsx` | The page's components |

**Modify:**

| File | Change |
| --- | --- |
| `src/db/worker.ts:23-34` | `BOOTSTRAP_SQL` += `recurrences`; comment "six-table" → "seven-table" |
| `src/features/entries/fx.ts:15-18` | `frankfurterUrl(currencies, date?)` |
| `src/features/entries/fx.test.ts` | Cover the date arg |
| `src/features/entries/actions.ts:97-108` | `importBackupAction` → `rewindRecurrences` |
| `src/features/entries/queries.ts:294,445` | `deleteCategory`/`deleteAccount` guard on rules |
| `src/features/settings/data.ts:11-13` | `wipeAllData` clears `recurrences` |
| `src/app/layout.tsx` | Call `useRecurringSweep()` |
| `src/app/recurring/page.tsx` | New route |
| `src/shared/ui/MoreSheet.tsx` | Link to `/recurring` |

---

### Task 1: The `recurrences` table

**Files:**
- Create: `src/features/recurring/schema.ts`
- Create: `src/features/recurring/schema.test.ts`
- Modify: `src/db/worker.ts:20-34`

**Interfaces:**
- Consumes: `Db` from `@db/client`; `ensureCategoriesTable` from `@features/categories/schema`; `ensureAccountsTable` from `@features/accounts/schema`
- Produces: `recurrences` (drizzle table), `type Recurrence = typeof recurrences.$inferSelect`, `type NewRecurrence = typeof recurrences.$inferInsert`, `ensureRecurrencesTable(db: Db): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeNodeProxyDb } from '@db/client';
import { ensureRecurrencesTable, recurrences } from './schema';

async function db() {
  const d = makeNodeProxyDb();
  await ensureRecurrencesTable(d);
  return d;
}

describe('recurrences table', () => {
  it('round-trips a rule with its nullable columns', async () => {
    const d = await db();
    await d
      .insert(recurrences)
      .values({
        name: 'Netflix',
        day: 5,
        intervalMonths: 1,
        accountId: 1,
        categoryId: 2,
        amount: 9.99,
        currency: 'USD',
        rate: null,
        totalCount: null,
        startSeq: 1,
        startDate: '2026-07-05',
        lastPosted: null,
      })
      .run();
    const rows = await d.select().from(recurrences).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Netflix',
      day: 5,
      intervalMonths: 1,
      amount: 9.99,
      currency: 'USD',
      rate: null,
      totalCount: null,
      startSeq: 1,
      startDate: '2026-07-05',
      lastPosted: null,
      archived: 0,
    });
  });

  it('ensures its FK tables, so calling it alone yields a queryable rule', async () => {
    const d = await db();
    // ensureRecurrencesTable must bootstrap categories + accounts like ensureEntriesTable does
    await expect(d.select().from(recurrences).all()).resolves.toEqual([]);
  });

  // The ONE documented drift failure: schema.ts and worker.ts's BOOTSTRAP_SQL must agree.
  // Tests run against the Node shim (schema.ts), so only this guard or a browser catches it.
  it('is present in the shipping BOOTSTRAP_SQL', () => {
    const worker = readFileSync('src/db/worker.ts', 'utf8');
    expect(worker).toMatch(/CREATE TABLE IF NOT EXISTS recurrences/);
    for (const col of [
      'interval_months',
      'total_count',
      'start_seq',
      'start_date',
      'last_posted',
    ]) {
      expect(worker).toContain(col);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/schema.test.ts`
Expected: FAIL — `Failed to resolve import "./schema"`

- [ ] **Step 3: Write the schema**

Create `src/features/recurring/schema.ts`:

```ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import type { Db } from '@db/client';

// Standing rules that post themselves into the ledger — subscriptions (open-ended), bills, and
// installments (a fixed totalCount). This file is the schema source of truth; the shipping bootstrap
// duplicates the DDL in src/db/worker.ts and MUST stay in lockstep (schema.test.ts guards it).
//
// `lastPosted` is the ONLY mutable pointer. The payment number, paid count, and remaining count are
// all DERIVED from it in schedule.ts — never stored. That is what lets the backup rewind
// (rewindRecurrences) clamp one field and have the counters follow correctly; a stored seq counter
// would need lockstep unwinding and could silently drift.
//
// `amount` is stored POSITIVE (a bill reads as "฿2,000/mo" in the form); the sweep negates it, so the
// ledger's every-row-is-negative invariant holds.
export const recurrences = sqliteTable('recurrences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(), // 'Netflix' — becomes the entry note
  day: integer('day').notNull(), // 1–31, clamped to month length at post time
  intervalMonths: integer('interval_months').notNull().default(1), // 1 = monthly, 12 = yearly
  accountId: integer('account_id'), // FK → accounts.id
  categoryId: integer('category_id'), // FK → categories.id
  amount: real('amount').notNull(), // POSITIVE magnitude; sweep negates
  currency: text('currency'), // null/'THB' = plain THB; 'USD' = FX rule
  rate: real('rate'), // null = live ECB+fee at the due date; set = pinned
  totalCount: integer('total_count'), // null = subscription; 12 = installment
  startSeq: integer('start_seq').notNull().default(1), // "next is #4" → 4
  startDate: text('start_date').notNull(), // YYYY-MM-DD, the first due date (pre-clamped)
  lastPosted: text('last_posted'), // YYYY-MM-DD; null = never posted
  archived: integer('archived').notNull().default(0),
});

export type Recurrence = typeof recurrences.$inferSelect;
export type NewRecurrence = typeof recurrences.$inferInsert;

// Ensures the FK tables alongside recurrences, so calling this alone yields a queryable rule —
// the same invariant ensureEntriesTable provides.
export async function ensureRecurrencesTable(db: Db): Promise<void> {
  await ensureCategoriesTable(db);
  await ensureAccountsTable(db);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS recurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      day INTEGER NOT NULL,
      interval_months INTEGER NOT NULL DEFAULT 1,
      account_id INTEGER,
      category_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT,
      rate REAL,
      total_count INTEGER,
      start_seq INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      last_posted TEXT,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
}
```

- [ ] **Step 4: Add the identical DDL to the shipping bootstrap**

In `src/db/worker.ts`, change the comment on line 20-22 from "the six-table DDL" to "the seven-table DDL", and append to `BOOTSTRAP_SQL` (after the `trip_titles` entry, line 33):

```ts
  `CREATE TABLE IF NOT EXISTS recurrences (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
     day INTEGER NOT NULL, interval_months INTEGER NOT NULL DEFAULT 1, account_id INTEGER,
     category_id INTEGER, amount REAL NOT NULL, currency TEXT, rate REAL, total_count INTEGER,
     start_seq INTEGER NOT NULL DEFAULT 1, start_date TEXT NOT NULL, last_posted TEXT,
     archived INTEGER NOT NULL DEFAULT 0)`,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/features/recurring/schema.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 6: Gates + commit**

```bash
npm run format:files src/features/recurring/schema.ts src/features/recurring/schema.test.ts src/db/worker.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/schema.ts src/features/recurring/schema.test.ts src/db/worker.ts
git commit -m "feat(db): add the recurrences table" -m "Standing rules for subscriptions, bills, and installments. lastPosted is the only mutable pointer — seq/paid/remaining derive from it in schedule.ts, so the backup rewind clamps one field and the counters follow." -m "DDL duplicated into worker.ts BOOTSTRAP_SQL per the lockstep rule; schema.test.ts guards the drift that tests otherwise cannot catch."
```

---

### Task 2: Pure schedule math

**Files:**
- Create: `src/features/recurring/schedule.ts`
- Create: `src/features/recurring/schedule.test.ts`

**Interfaces:**
- Consumes: nothing (fully pure — no DB, no network, no imports from this repo)
- Produces:
  - `type Rule = { day: number; intervalMonths: number; startDate: string; startSeq: number; totalCount: number | null; lastPosted: string | null }` — a structural subset, so `Recurrence` is assignable to it
  - `type Due = { date: string; seq: number }`
  - `type Progress = { paid: number; total: number | null; remaining: number | null }`
  - `clampDay(year: number, month: number, day: number): string` — month is **1-based**
  - `dueDateAt(rule: Rule, i: number): string`
  - `paidCount(rule: Rule): number`
  - `maxPosts(rule: Rule): number | null`
  - `duePosts(rule: Rule, todayIso: string): Due[]`
  - `progressOf(rule: Rule): Progress`
  - `noteFor(rule: { name: string; totalCount: number | null }, seq: number): string`

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/schedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  clampDay,
  dueDateAt,
  paidCount,
  maxPosts,
  duePosts,
  progressOf,
  noteFor,
  type Rule,
} from './schedule';

// A monthly subscription on the 5th, never posted.
const netflix: Rule = {
  day: 5,
  intervalMonths: 1,
  startDate: '2026-07-05',
  startSeq: 1,
  totalCount: null,
  lastPosted: null,
};

// A 12-month installment where 3 were already paid elsewhere, so the next is #4.
const fridge: Rule = {
  day: 1,
  intervalMonths: 1,
  startDate: '2026-07-01',
  startSeq: 4,
  totalCount: 12,
  lastPosted: null,
};

describe('clampDay', () => {
  it('clamps a 31st rule to the last day of a short month', () => {
    expect(clampDay(2026, 2, 31)).toBe('2026-02-28');
    expect(clampDay(2026, 4, 31)).toBe('2026-04-30');
    expect(clampDay(2026, 1, 31)).toBe('2026-01-31');
  });

  it('clamps to Feb 29 in a leap year', () => {
    expect(clampDay(2028, 2, 31)).toBe('2028-02-29');
    expect(clampDay(2028, 2, 30)).toBe('2028-02-29');
  });

  it('pads single digits', () => {
    expect(clampDay(2026, 3, 5)).toBe('2026-03-05');
  });
});

describe('dueDateAt', () => {
  it('steps monthly from the start month, re-clamping each month', () => {
    const eom: Rule = { ...netflix, day: 31, startDate: '2026-01-31' };
    expect(dueDateAt(eom, 0)).toBe('2026-01-31');
    expect(dueDateAt(eom, 1)).toBe('2026-02-28'); // clamped
    expect(dueDateAt(eom, 2)).toBe('2026-03-31'); // and back to 31 — day is the anchor
  });

  it('steps a year for intervalMonths 12', () => {
    const icloud: Rule = { ...netflix, intervalMonths: 12 };
    expect(dueDateAt(icloud, 0)).toBe('2026-07-05');
    expect(dueDateAt(icloud, 1)).toBe('2027-07-05');
  });

  it('rolls the year on a monthly step', () => {
    const dec: Rule = { ...netflix, startDate: '2026-12-05' };
    expect(dueDateAt(dec, 1)).toBe('2027-01-05');
  });
});

describe('paidCount', () => {
  it('is 0 when never posted', () => {
    expect(paidCount(netflix)).toBe(0);
  });

  it('counts due dates at or before lastPosted', () => {
    expect(paidCount({ ...netflix, lastPosted: '2026-07-05' })).toBe(1);
    expect(paidCount({ ...netflix, lastPosted: '2026-09-05' })).toBe(3);
  });

  it('does not count a due date later in lastPosted month', () => {
    expect(paidCount({ ...netflix, lastPosted: '2026-09-03' })).toBe(2);
  });

  it('counts a yearly rule once per year', () => {
    const icloud: Rule = { ...netflix, intervalMonths: 12, lastPosted: '2027-07-05' };
    expect(paidCount(icloud)).toBe(2);
  });
});

describe('maxPosts', () => {
  it('is null for an open-ended subscription', () => {
    expect(maxPosts(netflix)).toBeNull();
  });

  it('accounts for payments made before the rule existed', () => {
    expect(maxPosts(fridge)).toBe(9); // #4..#12
    expect(maxPosts({ ...fridge, startSeq: 1 })).toBe(12);
  });

  it('is 0, not negative, for an already-finished installment', () => {
    expect(maxPosts({ ...fridge, startSeq: 13 })).toBe(0);
  });
});

describe('duePosts', () => {
  it('is empty before the start date', () => {
    expect(duePosts(netflix, '2026-07-04')).toEqual([]);
  });

  it('posts on the due date itself', () => {
    expect(duePosts(netflix, '2026-07-05')).toEqual([{ date: '2026-07-05', seq: 1 }]);
  });

  it('catches up every missed month, in order', () => {
    expect(duePosts(netflix, '2026-09-20')).toEqual([
      { date: '2026-07-05', seq: 1 },
      { date: '2026-08-05', seq: 2 },
      { date: '2026-09-05', seq: 3 },
    ]);
  });

  it('is empty when already posted through today — idempotence', () => {
    expect(duePosts({ ...netflix, lastPosted: '2026-09-05' }, '2026-09-20')).toEqual([]);
  });

  it('resumes from lastPosted, not from the start', () => {
    expect(duePosts({ ...netflix, lastPosted: '2026-07-05' }, '2026-09-20')).toEqual([
      { date: '2026-08-05', seq: 2 },
      { date: '2026-09-05', seq: 3 },
    ]);
  });

  it('numbers an installment from startSeq and stops at totalCount', () => {
    const due = duePosts(fridge, '2030-01-01');
    expect(due).toHaveLength(9);
    expect(due[0]).toEqual({ date: '2026-07-01', seq: 4 });
    expect(due[8]).toEqual({ date: '2027-03-01', seq: 12 });
  });

  it('posts nothing for a finished installment', () => {
    expect(duePosts({ ...fridge, lastPosted: '2027-03-01' }, '2030-01-01')).toEqual([]);
  });
});

describe('progressOf', () => {
  it('reports payments made before the rule existed as already paid', () => {
    expect(progressOf(fridge)).toEqual({ paid: 3, total: 12, remaining: 9 });
  });

  it('advances as posts happen', () => {
    expect(progressOf({ ...fridge, lastPosted: '2026-07-01' })).toEqual({
      paid: 4,
      total: 12,
      remaining: 8,
    });
  });

  it('has no total or remaining for a subscription', () => {
    expect(progressOf({ ...netflix, lastPosted: '2026-08-05' })).toEqual({
      paid: 2,
      total: null,
      remaining: null,
    });
  });
});

describe('noteFor', () => {
  it('appends the counter for an installment', () => {
    expect(noteFor({ name: 'Fridge', totalCount: 12 }, 4)).toBe('Fridge (4/12)');
  });

  it('leaves a subscription note bare', () => {
    expect(noteFor({ name: 'Netflix', totalCount: null }, 3)).toBe('Netflix');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/schedule.test.ts`
Expected: FAIL — `Failed to resolve import "./schedule"`

- [ ] **Step 3: Write the implementation**

Create `src/features/recurring/schedule.ts`:

```ts
// Pure schedule math for recurring rules. No DB, no network, no React — every edge case is pinned
// by schedule.test.ts.
//
// The due-date sequence is fully determined by startDate's YEAR-MONTH plus `day`:
//   D_i   = clampDay(ym(startDate) + i × intervalMonths, day)
//   seq_i = startSeq + i
// `day` (not startDate's day-of-month) is the canonical anchor, so a rule on the 31st starting in
// February has startDate '2026-02-28' and still fires on the 31st in March. Deriving `day` from
// startDate would lose that.
//
// NOTHING here reads a clock — the caller passes todayIso. That keeps it testable and keeps the
// Bangkok/UTC date policy at the boundary.

// A structural subset of Recurrence, so a full DB row is assignable without any mapping.
export type Rule = {
  day: number;
  intervalMonths: number;
  startDate: string; // YYYY-MM-DD
  startSeq: number;
  totalCount: number | null;
  lastPosted: string | null; // YYYY-MM-DD
};

export type Due = { date: string; seq: number };
export type Progress = { paid: number; total: number | null; remaining: number | null };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Day 0 of the NEXT month is the last day of this one — handles leap years without a rule table.
// `month` is 1-based; Date.UTC's month is 0-based, so passing `month` means "next month".
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// (year, 1-based month) shifted by delta months, normalized. Deliberately duplicated from
// entries/cycle.ts's private stepYM rather than exported across features — it is three lines of
// month arithmetic, and coupling the two features to share it buys nothing.
function stepYM(y: number, m: number, delta: number): [number, number] {
  const total = y * 12 + (m - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

function ymOf(iso: string): [number, number] {
  const [y, m] = iso.split('-').map(Number);
  return [y, m];
}

// A rule on the 31st fires Feb 28 (29 in a leap year), not never.
export function clampDay(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
}

// The i-th due date (0-based). i = 0 is the rule's first post, which equals startDate.
export function dueDateAt(rule: Rule, i: number): string {
  const [sy, sm] = ymOf(rule.startDate);
  const [y, m] = stepYM(sy, sm, i * rule.intervalMonths);
  return clampDay(y, m, rule.day);
}

// How many posts this rule has already made. Derived from lastPosted by month arithmetic — no loop
// over history, and no stored counter to drift.
export function paidCount(rule: Rule): number {
  if (rule.lastPosted === null) return 0;
  const [sy, sm] = ymOf(rule.startDate);
  const [ly, lm] = ymOf(rule.lastPosted);
  const months = ly * 12 + (lm - 1) - (sy * 12 + (sm - 1));
  if (months < 0) return 0;
  const i = Math.floor(months / rule.intervalMonths);
  // D_i lands in lastPosted's month (or the cadence's nearest earlier one); it counts only if it
  // actually fell on or before lastPosted.
  const count = dueDateAt(rule, i) <= rule.lastPosted ? i + 1 : i;
  const cap = maxPosts(rule);
  return cap === null ? count : Math.min(count, cap);
}

// How many posts this rule will EVER make. null = open-ended subscription. An installment that
// starts at #4 of 12 has 9 posts left in it, not 12.
export function maxPosts(rule: Rule): number | null {
  return rule.totalCount === null ? null : Math.max(0, rule.totalCount - rule.startSeq + 1);
}

// Every post owed from lastPosted (exclusive) through todayIso (inclusive), in order. This is the
// sweep's work list. Idempotence falls out for free: swept twice in a day, the second call returns
// []. No lock and no "last swept" timestamp is needed anywhere.
export function duePosts(rule: Rule, todayIso: string): Due[] {
  const cap = maxPosts(rule);
  const out: Due[] = [];
  for (let i = paidCount(rule); cap === null || i < cap; i++) {
    const date = dueDateAt(rule, i);
    if (date > todayIso) break;
    if (rule.lastPosted !== null && date <= rule.lastPosted) continue;
    out.push({ date, seq: rule.startSeq + i });
  }
  return out;
}

// What the page shows. `paid` includes payments made before the rule existed (startSeq - 1), so an
// installment added at "next is #4" reads "3 of 12 paid" before it ever posts.
export function progressOf(rule: Rule): Progress {
  const paid = rule.startSeq - 1 + paidCount(rule);
  return {
    paid,
    total: rule.totalCount,
    remaining: rule.totalCount === null ? null : Math.max(0, rule.totalCount - paid),
  };
}

// The posted entry's note. The installment counter is written into the note deliberately: it keeps
// the `entries` table unchanged, so it shows in Records, search, and the CSV export for free.
// Known ceiling: hand-editing that note re-syncs nothing.
export function noteFor(rule: { name: string; totalCount: number | null }, seq: number): string {
  return rule.totalCount === null ? rule.name : `${rule.name} (${seq}/${rule.totalCount})`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/recurring/schedule.test.ts`
Expected: PASS, all describe blocks green

- [ ] **Step 5: Gates + commit**

```bash
npm run format:files src/features/recurring/schedule.ts src/features/recurring/schedule.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/schedule.ts src/features/recurring/schedule.test.ts
git commit -m "feat(features): add pure schedule math for recurring rules" -m "Due dates, payment numbers, and installment progress all derive from the single lastPosted pointer by month arithmetic — no stored counter, so nothing can drift and the backup rewind gets correct seq numbers for free." -m "Anchored on \`day\` rather than startDate's day-of-month, so a 31st rule clamps to Feb 28/29 and returns to the 31st in March. Takes todayIso as an argument — no clock is read here."
```

---

### Task 3: Rule queries

**Files:**
- Create: `src/features/recurring/queries.ts`
- Create: `src/features/recurring/queries.test.ts`

**Interfaces:**
- Consumes: `recurrences`, `Recurrence`, `NewRecurrence`, `ensureRecurrencesTable` (Task 1); `Db` from `@db/client`; `entries` from `@features/entries/schema`
- Produces:
  - `listRules(db: Db): Promise<Recurrence[]>` — non-archived, oldest first
  - `getRule(db: Db, id: number): Promise<Recurrence | undefined>`
  - `addRule(db: Db, rule: NewRecurrence): Promise<void>`
  - `updateRule(db: Db, id: number, rule: Partial<NewRecurrence>): Promise<void>`
  - `archiveRule(db: Db, id: number): Promise<void>`
  - `markPosted(db: Db, id: number, date: string): Promise<void>`
  - `rewindRecurrences(db: Db, maxDate: string): Promise<void>`
  - `type PostRow = { date: string; accountId: number | null; categoryId: number | null; amount: number; currency: string | null; originalAmount: number | null; note: string }`
  - `postRecurringEntries(db: Db, rows: PostRow[]): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/queries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureRecurrencesTable, recurrences, type NewRecurrence } from './schema';
import {
  listRules,
  getRule,
  addRule,
  updateRule,
  archiveRule,
  markPosted,
  rewindRecurrences,
  postRecurringEntries,
} from './queries';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d);
  await ensureRecurrencesTable(d);
  return d;
}

const netflix: NewRecurrence = {
  name: 'Netflix',
  day: 5,
  intervalMonths: 1,
  accountId: 1,
  categoryId: 1,
  amount: 9.99,
  currency: 'USD',
  startDate: '2026-07-05',
};

describe('rule CRUD', () => {
  it('adds and lists a rule', async () => {
    const d = await db();
    await addRule(d, netflix);
    const rows = await listRules(d);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Netflix', day: 5, amount: 9.99 });
  });

  it('hides archived rules from the list but keeps them readable by id', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await archiveRule(d, row.id);
    expect(await listRules(d)).toEqual([]);
    expect(await getRule(d, row.id)).toMatchObject({ name: 'Netflix', archived: 1 });
  });

  it('updates a rule in place', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await updateRule(d, row.id, { amount: 12.99, rate: 36.5 });
    expect(await getRule(d, row.id)).toMatchObject({ amount: 12.99, rate: 36.5, name: 'Netflix' });
  });

  it('advances the lastPosted pointer', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await markPosted(d, row.id, '2026-09-05');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: '2026-09-05' });
  });
});

describe('rewindRecurrences', () => {
  it('clamps a pointer that ran past the backup, so the sweep refills the gap', async () => {
    const d = await db();
    await addRule(d, { ...netflix, lastPosted: '2026-07-05' });
    const [row] = await listRules(d);
    await rewindRecurrences(d, '2026-06-20');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: '2026-06-20' });
  });

  it('leaves a pointer already behind the backup alone', async () => {
    const d = await db();
    await addRule(d, { ...netflix, lastPosted: '2026-05-05' });
    const [row] = await listRules(d);
    await rewindRecurrences(d, '2026-06-20');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: '2026-05-05' });
  });

  it('leaves a never-posted rule alone', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await rewindRecurrences(d, '2026-06-20');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: null });
  });

  it('rewinds archived rules too — an archived rule can be un-archived later', async () => {
    const d = await db();
    await addRule(d, { ...netflix, lastPosted: '2026-07-05', archived: 1 });
    await rewindRecurrences(d, '2026-06-20');
    const [row] = await d.select().from(recurrences).all();
    expect(row.lastPosted).toBe('2026-06-20');
  });
});

describe('postRecurringEntries', () => {
  it('inserts ledger rows with ids directly and tags the source', async () => {
    const d = await db();
    await postRecurringEntries(d, [
      {
        date: '2026-07-05',
        accountId: 1,
        categoryId: 2,
        amount: -364.5,
        currency: 'USD',
        originalAmount: -9.99,
        note: 'Netflix',
      },
    ]);
    const rows = await d.select().from(entries).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-07-05',
      accountId: 1,
      categoryId: 2,
      amount: -364.5,
      currency: 'USD',
      originalAmount: -9.99,
      note: 'Netflix',
      source: 'recurring',
    });
  });

  it('is a no-op on an empty list', async () => {
    const d = await db();
    await postRecurringEntries(d, []);
    expect(await d.select().from(entries).all()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/queries.test.ts`
Expected: FAIL — `Failed to resolve import "./queries"`

- [ ] **Step 3: Write the implementation**

Create `src/features/recurring/queries.ts`:

```ts
import { eq, and, gt, isNotNull } from 'drizzle-orm';
import type { Db } from '@db/client';
import { entries } from '@features/entries/schema';
import { recurrences, type Recurrence, type NewRecurrence } from './schema';

// Typed reads/writes for recurring rules. Column selections infer row types — no `as` casts.

// Non-archived rules, oldest first, so the page's order is stable as rules are added.
export async function listRules(db: Db): Promise<Recurrence[]> {
  return await db
    .select()
    .from(recurrences)
    .where(eq(recurrences.archived, 0))
    .orderBy(recurrences.id)
    .all();
}

export async function getRule(db: Db, id: number): Promise<Recurrence | undefined> {
  return await db.select().from(recurrences).where(eq(recurrences.id, id)).get();
}

export async function addRule(db: Db, rule: NewRecurrence): Promise<void> {
  await db.insert(recurrences).values(rule).run();
}

export async function updateRule(db: Db, id: number, rule: Partial<NewRecurrence>): Promise<void> {
  await db.update(recurrences).set(rule).where(eq(recurrences.id, id)).run();
}

// Archive, never delete — posted history stays explainable, and the rule can come back.
export async function archiveRule(db: Db, id: number): Promise<void> {
  await db.update(recurrences).set({ archived: 1 }).where(eq(recurrences.id, id)).run();
}

// Advance the pointer to the newest date just posted. The ONLY mutation the sweep makes to a rule.
export async function markPosted(db: Db, id: number, date: string): Promise<void> {
  await db.update(recurrences).set({ lastPosted: date }).where(eq(recurrences.id, id)).run();
}

// Called after a replace-all CSV restore. The backup carries no rule id, so after a restore the
// ledger and the rules are strangers: a rule may claim it posted through July while the restored
// ledger stops at June. Clamping every pointer to the CSV's newest date makes the next sweep refill
// the gap, and because seq DERIVES from lastPosted (see schedule.ts) the payment numbers come back
// correct with no extra work.
//
// Clamping is correct in both directions: entries at or before maxDate are already in the restored
// ledger and must not repost; the CSV holds nothing after maxDate, so everything after it must.
// Archived rules are rewound too — an archived rule can be un-archived later, and a stale pointer
// would silently skip its gap.
export async function rewindRecurrences(db: Db, maxDate: string): Promise<void> {
  await db
    .update(recurrences)
    .set({ lastPosted: maxDate })
    .where(and(isNotNull(recurrences.lastPosted), gt(recurrences.lastPosted, maxDate)))
    .run();
}

// The sweep's insert shape. Unlike EntryInput (which carries category/account NAMES for the query
// layer to resolve), a rule already holds the ids — so these go straight in, skipping the
// name→id→name round trip that addEntries would impose.
export type PostRow = {
  date: string;
  accountId: number | null;
  categoryId: number | null;
  amount: number;
  currency: string | null;
  originalAmount: number | null;
  note: string;
};

// source 'recurring' joins 'manual' | 'monefy'. It is not carried by the Monefy CSV, so it does not
// survive a backup round-trip — the note is what identifies these rows durably.
export async function postRecurringEntries(db: Db, rows: PostRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(entries)
    .values(rows.map((r) => ({ ...r, time: null, source: 'recurring' })))
    .run();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/recurring/queries.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Gates + commit**

```bash
npm run format:files src/features/recurring/queries.ts src/features/recurring/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/queries.ts src/features/recurring/queries.test.ts
git commit -m "feat(features): add recurring rule queries" -m "CRUD plus the two writes the sweep and the restore need: markPosted advances the single pointer, rewindRecurrences clamps it to a restored backup's newest date so the sweep refills the gap." -m "postRecurringEntries inserts with category/account ids directly — a rule already holds them, so addEntries' name→id resolution would be a pointless round trip."
```

---

### Task 4: Historical rates from frankfurter

**Files:**
- Modify: `src/features/entries/fx.ts:15-18`
- Modify: `src/features/entries/fx.test.ts`

**Interfaces:**
- Consumes: `Currency` from `./entry-form`
- Produces: `frankfurterUrl(currencies: readonly Currency[], date?: string): string` — **backwards compatible**; omitting `date` keeps the existing `/v1/latest` behaviour that `refreshFxRatesAction` depends on.

- [ ] **Step 1: Write the failing test**

Append to `src/features/entries/fx.test.ts` (inside the existing `frankfurterUrl` describe block if there is one, otherwise as a new block):

```ts
describe('frankfurterUrl with a date', () => {
  it('still targets /latest when no date is given', () => {
    expect(frankfurterUrl(['USD', 'JPY'])).toBe(
      'https://api.frankfurter.dev/v1/latest?base=THB&symbols=USD,JPY',
    );
  });

  it('targets the dated fixing when a date is given', () => {
    expect(frankfurterUrl(['USD'], '2026-07-05')).toBe(
      'https://api.frankfurter.dev/v1/2026-07-05?base=THB&symbols=USD',
    );
  });

  it('still drops THB from the symbols', () => {
    expect(frankfurterUrl(['THB', 'USD'], '2026-07-05')).toBe(
      'https://api.frankfurter.dev/v1/2026-07-05?base=THB&symbols=USD',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/fx.test.ts`
Expected: FAIL — the dated cases produce `/v1/latest?...`

- [ ] **Step 3: Write the implementation**

Replace `frankfurterUrl` in `src/features/entries/fx.ts` (lines 15-18). Keep the existing block comment above it and extend it:

```ts
// The frankfurter query URL: one call for every non-THB currency, based in THB. Response shape is
// { base:'THB', date:'YYYY-MM-DD', rates:{ JPY: <JPY per 1 THB>, ... } } — note the rates are
// foreign-per-THB, so parseEcbResponse inverts them to THB-per-foreign.
//
// `date` selects a historical fixing (/v1/2026-07-05) instead of the latest one. The recurring sweep
// needs this: a subscription due on the 5th must convert at the 5th's rate even when the app is not
// opened until the 20th. The response shape is identical, so parseEcbResponse is unchanged.
// ECB publishes no weekend/holiday fixing; frankfurter answers those dates with the previous
// fixing, which is the desired behaviour, not an error case.
export function frankfurterUrl(currencies: readonly Currency[], date?: string): string {
  const symbols = currencies.filter((c) => c !== 'THB').join(',');
  return `https://api.frankfurter.dev/v1/${date ?? 'latest'}?base=THB&symbols=${symbols}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/entries/fx.test.ts`
Expected: PASS. Also run `npm test` — `refreshFxRatesAction` calls `frankfurterUrl(CURRENCIES)` with no date and must be unaffected.

- [ ] **Step 5: Gates + commit**

```bash
npm run format:files src/features/entries/fx.ts src/features/entries/fx.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/fx.ts src/features/entries/fx.test.ts
git commit -m "feat(features): let frankfurterUrl target a historical fixing" -m "A recurring subscription due on the 5th must convert at the 5th's rate even when the app is not opened until the 20th. The dated endpoint returns an identical shape, so parseEcbResponse is untouched." -m "The date is optional and defaults to /latest, so refreshFxRatesAction is unaffected."
```

---

### Task 5: Rate resolution

**Files:**
- Create: `src/features/recurring/rates.ts`
- Create: `src/features/recurring/rates.test.ts`

**Interfaces:**
- Consumes: `frankfurterUrl`, `parseEcbResponse`, `withFee`, `toThb` from `@features/entries/fx`; `isCurrency` from `@features/entries/entry-form`; `getCardFeePct`, `getFxRates` from `@features/settings/queries`; `Db` from `@db/client`
- Produces:
  - `type RateRule = { currency: string | null; rate: number | null }`
  - `resolveRate(db: Db, rule: RateRule, date: string): Promise<number>` — throws when a foreign rule has neither a fetched nor a cached rate
  - `type Converted = { amount: number; currency: string | null; originalAmount: number | null }`
  - `convertAmount(db: Db, rule: RateRule & { amount: number }, date: string): Promise<Converted>` — returns **negated** ledger values

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/rates.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { setCardFeePct, setFxRates } from '@features/settings/queries';
import { resolveRate, convertAmount } from './rates';

async function db() {
  const d = makeNodeProxyDb();
  await ensureSettingsTable(d);
  await setCardFeePct(d, 2.5);
  return d;
}

// frankfurter returns foreign-per-THB; parseEcbResponse inverts. 1/0.0275 ≈ 36.36 THB per USD.
function ecbResponse(date: string, perThb: number) {
  return { ok: true, json: async () => ({ base: 'THB', date, rates: { USD: perThb } }) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveRate', () => {
  it('uses a pinned rate without touching the network', async () => {
    const d = await db();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await resolveRate(d, { currency: 'USD', rate: 36.5 }, '2026-07-05')).toBe(36.5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches the fixing for the DUE DATE, not today, and layers the card fee', async () => {
    const d = await db();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ecbResponse('2026-07-05', 0.0275));
    const rate = await resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05');
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/2026-07-05');
    expect(rate).toBeCloseTo((1 / 0.0275) * 1.025, 6);
  });

  it('falls back to the cached rate when the fetch fails — never blocks the ledger', async () => {
    const d = await db();
    await setFxRates(d, { USD: { thbPerUnit: 35, asOf: '2026-06-30' } });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05')).toBeCloseTo(
      35 * 1.025,
      6,
    );
  });

  it('falls back to the cache on a non-ok response too', async () => {
    const d = await db();
    await setFxRates(d, { USD: { thbPerUnit: 35, asOf: '2026-06-30' } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05')).toBeCloseTo(
      35 * 1.025,
      6,
    );
  });

  it('throws when there is neither a fetched nor a cached rate', async () => {
    const d = await db();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(resolveRate(d, { currency: 'USD', rate: null }, '2026-07-05')).rejects.toThrow(
      /USD/,
    );
  });

  it('rejects a currency the app does not know', async () => {
    const d = await db();
    await expect(resolveRate(d, { currency: 'XYZ', rate: null }, '2026-07-05')).rejects.toThrow(
      /XYZ/,
    );
  });
});

describe('convertAmount', () => {
  it('negates a plain THB rule and stores no originalAmount', async () => {
    const d = await db();
    expect(await convertAmount(d, { currency: 'THB', rate: null, amount: 2000 }, '2026-07-01')).toEqual(
      { amount: -2000, currency: 'THB', originalAmount: null },
    );
  });

  it('treats a null currency as THB (legacy rows)', async () => {
    const d = await db();
    expect(await convertAmount(d, { currency: null, rate: null, amount: 2000 }, '2026-07-01')).toEqual(
      { amount: -2000, currency: null, originalAmount: null },
    );
  });

  it('converts a foreign rule and stores originalAmount SIGNED, matching entry-form', async () => {
    const d = await db();
    const got = await convertAmount(d, { currency: 'USD', rate: 36.5, amount: 9.99 }, '2026-07-05');
    expect(got).toEqual({
      amount: -Math.round(9.99 * 36.5 * 100) / 100,
      currency: 'USD',
      originalAmount: -9.99,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/rates.test.ts`
Expected: FAIL — `Failed to resolve import "./rates"`

- [ ] **Step 3: Write the implementation**

Create `src/features/recurring/rates.ts`:

```ts
import type { Db } from '@db/client';
import { frankfurterUrl, parseEcbResponse, withFee, toThb } from '@features/entries/fx';
import { isCurrency } from '@features/entries/entry-form';
import { getCardFeePct, getFxRates } from '@features/settings/queries';

// Which THB rate a recurring post converts at, and the ledger values that follow.
//
// The order is: a pinned rate wins outright → THB needs no rate → otherwise fetch the ECB fixing for
// THE DUE DATE (not today) and layer the card fee → and if that fails, use the cached rate rather
// than block the ledger. Only a foreign rule with no rate anywhere throws, and the sweep catches
// per-rule so it retries on the next app open.

export type RateRule = { currency: string | null; rate: number | null };
export type Converted = { amount: number; currency: string | null; originalAmount: number | null };

// A rule with no currency, or an explicit THB one, is a plain baht bill.
function isPlainThb(rule: RateRule): boolean {
  return rule.currency === null || rule.currency === 'THB';
}

// The ECB mid-rate for one currency on one date, or null on any failure — offline-tolerant by
// design, mirroring refreshFxRatesAction's swallow-and-keep-the-cache shape.
async function fetchMid(code: string, date: string): Promise<number | null> {
  if (!isCurrency(code)) return null;
  try {
    const res = await fetch(frankfurterUrl([code], date), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseEcbResponse(json).thbPerUnit[code] ?? null;
  } catch {
    return null;
  }
}

// The effective (fee-inclusive) THB-per-unit rate for a rule's post on `date`.
export async function resolveRate(db: Db, rule: RateRule, date: string): Promise<number> {
  // A pinned rate is what the user's statement actually charged — the fee is already baked into the
  // number they typed, so withFee must NOT be applied on top of it.
  if (rule.rate !== null) return rule.rate;

  const code = rule.currency;
  if (code === null) throw new Error('resolveRate: called for a rule with no currency');
  if (!isCurrency(code)) throw new Error(`resolveRate: unknown currency "${code}"`);

  const feePct = await getCardFeePct(db);
  const mid = await fetchMid(code, date);
  if (mid !== null) return withFee(mid, feePct);

  const cached = (await getFxRates(db))[code];
  if (cached === undefined) {
    throw new Error(`resolveRate: no rate for ${code} on ${date} and nothing cached`);
  }
  return withFee(cached.thbPerUnit, feePct);
}

// A rule's positive amount → the ledger's signed values. `originalAmount` is stored SIGNED, the same
// sign as `amount` — matching entry-form.ts:62 (`originalAmount: sign * amount`), so a recurring
// foreign row is indistinguishable from a hand-entered one.
export async function convertAmount(
  db: Db,
  rule: RateRule & { amount: number },
  date: string,
): Promise<Converted> {
  if (isPlainThb(rule)) {
    return { amount: -rule.amount, currency: rule.currency, originalAmount: null };
  }
  const rate = await resolveRate(db, rule, date);
  return {
    amount: -toThb(rule.amount, rate),
    currency: rule.currency,
    originalAmount: -rule.amount,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/recurring/rates.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Gates + commit**

```bash
npm run format:files src/features/recurring/rates.ts src/features/recurring/rates.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/rates.ts src/features/recurring/rates.test.ts
git commit -m "feat(features): resolve the FX rate for a recurring post's due date" -m "A subscription due on the 5th converts at the 5th's ECB fixing plus the card fee, not at whatever rate happens to be cached when the app is next opened. A per-rule pinned rate overrides and skips the network entirely." -m "A failed fetch falls back to the cached rate and posts anyway — the ledger never blocks on the network. Only a foreign rule with no rate anywhere throws, and the sweep isolates that per rule."
```

---

### Task 6: The sweep

**Files:**
- Create: `src/features/recurring/sweep.ts`
- Create: `src/features/recurring/sweep.test.ts`

**Interfaces:**
- Consumes: `listRules`, `markPosted`, `postRecurringEntries`, `type PostRow` (Task 3); `duePosts`, `noteFor` (Task 2); `convertAmount` (Task 5); `Db` from `@db/client`
- Produces: `runSweep(db: Db, todayIso: string): Promise<number>` — returns how many entries were posted; never throws for a single bad rule

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/sweep.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { gt } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { setCardFeePct, setFxRates } from '@features/settings/queries';
import { ensureRecurrencesTable, type NewRecurrence } from './schema';
import { addRule, listRules, rewindRecurrences } from './queries';
import { runSweep } from './sweep';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d);
  await ensureSettingsTable(d);
  await ensureRecurrencesTable(d);
  await setCardFeePct(d, 0); // zero fee keeps the arithmetic readable in these tests
  return d;
}

const rent: NewRecurrence = {
  name: 'Rent',
  day: 1,
  intervalMonths: 1,
  accountId: 1,
  categoryId: 1,
  amount: 15000,
  currency: 'THB',
  startDate: '2026-07-01',
};

const fridge: NewRecurrence = {
  name: 'Fridge',
  day: 1,
  intervalMonths: 1,
  accountId: 1,
  categoryId: 2,
  amount: 2000,
  currency: 'THB',
  totalCount: 12,
  startSeq: 4,
  startDate: '2026-07-01',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runSweep', () => {
  it('posts nothing before the start date', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-06-30')).toBe(0);
    expect(await d.select().from(entries).all()).toEqual([]);
  });

  it('posts a due bill as a NEGATIVE entry dated the due date', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    const rows = await d.select().from(entries).all();
    expect(rows[0]).toMatchObject({
      date: '2026-07-01',
      amount: -15000,
      note: 'Rent',
      source: 'recurring',
      accountId: 1,
      categoryId: 1,
    });
  });

  it('catches up every missed month at once, dated correctly', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-09-20')).toBe(3);
    const dates = (await d.select().from(entries).all()).map((r) => r.date);
    expect(dates).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
  });

  it('is idempotent — a second sweep the same day posts nothing', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    expect(await runSweep(d, '2026-07-20')).toBe(0);
    expect(await d.select().from(entries).all()).toHaveLength(1);
  });

  it('advances lastPosted to the newest date posted', async () => {
    const d = await db();
    await addRule(d, rent);
    await runSweep(d, '2026-09-20');
    const [row] = await listRules(d);
    expect(row.lastPosted).toBe('2026-09-01');
  });

  it('numbers installment notes from startSeq and stops at totalCount', async () => {
    const d = await db();
    await addRule(d, fridge);
    expect(await runSweep(d, '2030-01-01')).toBe(9);
    const notes = (await d.select().from(entries).all()).map((r) => r.note);
    expect(notes[0]).toBe('Fridge (4/12)');
    expect(notes[8]).toBe('Fridge (12/12)');
  });

  it('skips archived rules', async () => {
    const d = await db();
    await addRule(d, { ...rent, archived: 1 });
    expect(await runSweep(d, '2026-07-20')).toBe(0);
  });

  it('converts an FX rule at the due date fixing', async () => {
    const d = await db();
    await addRule(d, { ...rent, name: 'Netflix', day: 5, amount: 9.99, currency: 'USD', startDate: '2026-07-05' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ base: 'THB', date: '2026-07-05', rates: { USD: 0.0275 } }),
    });
    await runSweep(d, '2026-07-20');
    const [row] = await d.select().from(entries).all();
    expect(row.amount).toBeCloseTo(-Math.round((9.99 / 0.0275) * 100) / 100, 2);
    expect(row.originalAmount).toBe(-9.99);
    expect(row.currency).toBe('USD');
  });

  it('isolates a failing rule: the others still post and the failed one keeps its pointer', async () => {
    const d = await db();
    await addRule(d, rent);
    // A foreign rule with no cached rate and no network — resolveRate throws for this one only.
    await addRule(d, { ...rent, name: 'Netflix', amount: 9.99, currency: 'USD' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    const rules = await listRules(d);
    expect(rules.find((r) => r.name === 'Rent')?.lastPosted).toBe('2026-07-01');
    expect(rules.find((r) => r.name === 'Netflix')?.lastPosted).toBeNull(); // retries next open
  });

  it('posts a failed-fetch FX rule at the cached rate rather than skipping it', async () => {
    const d = await db();
    await setFxRates(d, { USD: { thbPerUnit: 35, asOf: '2026-06-30' } });
    await addRule(d, { ...rent, name: 'Netflix', amount: 10, currency: 'USD' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    const [row] = await d.select().from(entries).all();
    expect(row.amount).toBe(-350);
  });

  it('refills the gap after a rewind, with correct seq numbers', async () => {
    const d = await db();
    await addRule(d, fridge);
    await runSweep(d, '2026-09-20'); // posts #4 (Jul), #5 (Aug), #6 (Sep)

    // Simulate a restore to a mid-July backup: the ledger loses everything after Jul 15, and
    // rewindRecurrences clamps the pointer to match.
    await d.delete(entries).where(gt(entries.date, '2026-07-15')).run();
    await rewindRecurrences(d, '2026-07-15');

    // The gap refills, and the seq numbers are still 5 and 6 — NOT restarted at 4 — because they
    // derive from the clamped pointer rather than a stored counter.
    expect(await runSweep(d, '2026-09-20')).toBe(2);
    const notes = (await d.select().from(entries).all()).map((r) => r.note);
    expect(notes).toEqual(['Fridge (4/12)', 'Fridge (5/12)', 'Fridge (6/12)']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/sweep.test.ts`
Expected: FAIL — `Failed to resolve import "./sweep"`

- [ ] **Step 3: Write the implementation**

Create `src/features/recurring/sweep.ts`:

```ts
import type { Db } from '@db/client';
import { listRules, markPosted, postRecurringEntries, type PostRow } from './queries';
import { duePosts, noteFor } from './schedule';
import { convertAmount } from './rates';

// THE SCHEDULER. There is no server and therefore no cron, so opening the app IS the schedule: this
// walks every active rule, posts whatever came due while the app was closed (dated its real due
// date), and advances each rule's pointer.
//
// Idempotence comes from the pointer, not from a lock: swept twice in a day, duePosts returns [] the
// second time. No "last swept" timestamp is stored anywhere.
//
// Takes todayIso as an argument rather than reading a clock, so it is testable and the date policy
// stays at the caller's boundary.
export async function runSweep(db: Db, todayIso: string): Promise<number> {
  let posted = 0;
  for (const rule of await listRules(db)) {
    const due = duePosts(rule, todayIso);
    if (due.length === 0) continue;
    try {
      const rows: PostRow[] = [];
      for (const { date, seq } of due) {
        const { amount, currency, originalAmount } = await convertAmount(db, rule, date);
        rows.push({
          date,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          amount,
          currency,
          originalAmount,
          note: noteFor(rule, seq),
        });
      }
      await postRecurringEntries(db, rows);
      await markPosted(db, rule.id, due[due.length - 1].date);
      posted += rows.length;
    } catch {
      // One unresolvable rule (a foreign rule with no rate fetched AND none cached) must not stop
      // the others. Its pointer is left untouched, so the next app open retries it.
      continue;
    }
  }
  return posted;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/recurring/sweep.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Gates + commit**

```bash
npm run format:files src/features/recurring/sweep.ts src/features/recurring/sweep.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/sweep.ts src/features/recurring/sweep.test.ts
git commit -m "feat(features): add the recurring sweep" -m "No server means no cron, so opening the app is the scheduler: the sweep posts whatever came due while the app was closed, dated its real due date, and advances each rule's pointer." -m "Idempotence falls out of the pointer rather than a lock. A rule that cannot resolve a rate is isolated — the others still post and it retries on the next open."
```

---

### Task 7: Wire the sweep into the app shell

**Files:**
- Create: `src/features/recurring/use-recurring-sweep.ts`
- Create: `src/features/recurring/use-recurring-sweep.test.ts`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `runSweep` (Task 6); `getBrowserDb` from `@db/browser`; `bumpDataVersion` from `@shared/data-version`; `todayIso` — **check `@shared/date` for an existing Bangkok-tz today helper and reuse it; only add one if none exists**
- Produces: `useRecurringSweep(): void`

- [ ] **Step 1: Find the existing today helper**

Run: `rg -n "export function" src/shared/date.ts`

Reuse whatever returns today's `YYYY-MM-DD`. The ledger's date keys are UTC-based (`Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' })`) per CLAUDE.md — match whatever `cycle.ts`'s callers already pass as `todayIso` so the sweep and the cycle agree on what "today" is. If no helper exists, add one to `@shared/date` rather than inlining a formatter here.

- [ ] **Step 2: Write the failing test**

Create `src/features/recurring/use-recurring-sweep.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const runSweep = vi.fn();
const bumpDataVersion = vi.fn();

vi.mock('./sweep', () => ({ runSweep }));
vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn(async () => ({})) }));
vi.mock('@shared/data-version', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/data-version')>()),
  bumpDataVersion,
}));

beforeEach(() => {
  vi.resetModules();
  runSweep.mockReset();
  bumpDataVersion.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRecurringSweep', () => {
  it('sweeps once and bumps the data version when it posted something', async () => {
    runSweep.mockResolvedValue(2);
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    renderHook(() => useRecurringSweep());
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bumpDataVersion).toHaveBeenCalledTimes(1));
  });

  it('does not bump when nothing was due — no pointless refetch', async () => {
    runSweep.mockResolvedValue(0);
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    renderHook(() => useRecurringSweep());
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
    expect(bumpDataVersion).not.toHaveBeenCalled();
  });

  it('is memoized: a second mount awaits the same sweep rather than re-running it', async () => {
    runSweep.mockResolvedValue(1);
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    renderHook(() => useRecurringSweep());
    renderHook(() => useRecurringSweep());
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
  });

  it('swallows a sweep failure — a broken sweep must never white-screen the shell', async () => {
    runSweep.mockRejectedValue(new Error('db gone'));
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    expect(() => renderHook(() => useRecurringSweep())).not.toThrow();
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/features/recurring/use-recurring-sweep.test.ts`
Expected: FAIL — `Failed to resolve import "./use-recurring-sweep"`

- [ ] **Step 4: Write the implementation**

Create `src/features/recurring/use-recurring-sweep.ts`. Replace `todayIso()` with the helper found in Step 1:

```ts
'use client';

import { useEffect } from 'react';
import { getBrowserDb } from '@db/browser';
import { bumpDataVersion } from '@shared/data-version';
import { runSweep } from './sweep';
import { todayIso } from '@shared/date';

// Opening the app is the scheduler (there is no server). Called once from the shell.
//
// Memoized behind a module-level promise — the same shape getBrowserDb() uses — so React strict
// mode's double-invoke awaits the same sweep instead of running two. That is an optimisation, not a
// correctness requirement: the pointer already makes a second sweep a no-op.
let sweepPromise: Promise<number> | null = null;

function sweepOnce(): Promise<number> {
  if (sweepPromise === null) {
    sweepPromise = getBrowserDb().then((db) => runSweep(db, todayIso()));
  }
  return sweepPromise;
}

export function useRecurringSweep(): void {
  useEffect(() => {
    // Read hooks mount and fetch concurrently with this, so a first paint can briefly show
    // pre-sweep numbers; the bump then triggers the refetch. Self-correcting, and consistent with
    // the app's post-mount async read model.
    void sweepOnce()
      .then((posted) => {
        if (posted > 0) bumpDataVersion();
      })
      .catch(() => {
        // A failed sweep must never take the shell down. runSweep already isolates per-rule
        // failures; reaching here means the db itself is unavailable, which every read hook will
        // surface on its own.
      });
  }, []);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/recurring/use-recurring-sweep.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 6: Call it from the shell**

In `src/app/layout.tsx`, import and call the hook in the shell component (the same component that already renders `AppHeader` + `BottomBar`). Add:

```tsx
import { useRecurringSweep } from '@features/recurring/use-recurring-sweep';
```

and inside the component body, before the return:

```tsx
  useRecurringSweep();
```

If `layout.tsx`'s default export is not itself a client component with a body (e.g. it renders a
`'use client'` shell child), put the call in that shell child instead — the hook must run inside a
client component that mounts on every route.

- [ ] **Step 7: Verify the app builds**

Run: `npm run build:web`
Expected: build succeeds, static `out/` produced

- [ ] **Step 8: Gates + commit**

```bash
npm run format:files src/features/recurring/use-recurring-sweep.ts src/features/recurring/use-recurring-sweep.test.ts src/app/layout.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/use-recurring-sweep.ts src/features/recurring/use-recurring-sweep.test.ts src/app/layout.tsx
git commit -m "feat(app): run the recurring sweep on app open" -m "With no server there is no cron, so the shell mounting is what catches the ledger up. Memoized behind a module-level promise like getBrowserDb, so strict mode's double-invoke awaits one sweep." -m "Bumps the data version only when something actually posted, so a quiet open costs no refetch. A sweep failure is swallowed — it must never white-screen the shell."
```

---

### Task 8: Refill the gap after a backup restore

**Files:**
- Modify: `src/features/entries/actions.ts:97-108`
- Modify: `src/features/entries/entries.test.ts` (or create `src/features/entries/restore-rewind.test.ts` if `entries.test.ts` does not cover actions)

**Interfaces:**
- Consumes: `rewindRecurrences` (Task 3)
- Produces: `importBackupAction` unchanged in signature — still `(csvText: string) => Promise<{ imported: number; skipped: number }>`

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/restore-rewind.test.ts` (kept in `recurring/` because it is testing the recurring behaviour, and it avoids `entries/` growing a dependency-shaped test):

```ts
import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureRecurrencesTable } from './schema';
import { addRule, listRules, rewindRecurrences } from './queries';
import { runSweep } from './sweep';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d);
  await ensureRecurrencesTable(d);
  return d;
}

describe('restoring an older backup', () => {
  it('rewinds the pointer so the next sweep refills the missing months', async () => {
    const d = await db();
    await addRule(d, {
      name: 'Rent',
      day: 1,
      intervalMonths: 1,
      accountId: 1,
      categoryId: 1,
      amount: 15000,
      currency: 'THB',
      startDate: '2026-06-01',
    });

    await runSweep(d, '2026-08-20'); // posts Jun 1, Jul 1, Aug 1
    expect((await listRules(d))[0].lastPosted).toBe('2026-08-01');

    // A restore replaces the ledger with a backup whose newest row is 2026-06-20.
    await rewindRecurrences(d, '2026-06-20');
    expect((await listRules(d))[0].lastPosted).toBe('2026-06-20');

    // The next sweep refills exactly the two missing months — not June, which the CSV still holds.
    expect(await runSweep(d, '2026-08-20')).toBe(2);
    expect((await listRules(d))[0].lastPosted).toBe('2026-08-01');
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `npm test -- src/features/recurring/restore-rewind.test.ts`
Expected: PASS — Task 3 already built `rewindRecurrences`. This test exists to pin the *end-to-end* rewind→refill behaviour that the action depends on. If it fails, fix `rewindRecurrences` before wiring the action.

- [ ] **Step 3: Wire the rewind into the restore action**

In `src/features/entries/actions.ts`, add the import:

```ts
import { rewindRecurrences } from '@features/recurring/queries';
```

Replace `importBackupAction` (lines 92-108) with:

```ts
// Restore the entire ledger from a Monefy-compatible CSV. Replace-all: parse, then restoreEntries wipes
// every existing entry and loads the file's rows. The caller (ImportBackup) reads the file + confirms first.
// Returns counts so the client can toast a summary. An empty/all-income file yields 0 entries (parseMonefyCsv
// does not throw); this refuses that — it throws before restoreEntries, so such a file can never silently
// clear the ledger.
//
// The CSV carries no rule id, so after a replace-all the ledger and the recurring rules are strangers: a
// rule may claim it posted through July while the restored ledger stops in June. Clamping every pointer to
// the CSV's newest date makes the next sweep refill the gap, and because the payment number derives from
// that pointer (schedule.ts), the installment seq numbers come back correct for free.
export async function importBackupAction(
  csvText: string,
): Promise<{ imported: number; skipped: number }> {
  const { entries: rows, skipped } = parseMonefyCsv(csvText);
  if (rows.length === 0) {
    throw new Error('Backup contained no importable entries');
  }
  const db = await getBrowserDb();
  await restoreEntries(db, rows);
  // Max over the already-parsed rows — no second pass over the text. The empty guard above means
  // this is always defined.
  const maxDate = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
  await rewindRecurrences(db, maxDate);
  bumpDataVersion();
  return { imported: rows.length, skipped };
}
```

Note the local rename `entries` → `rows`: the destructured name would otherwise shadow the `entries` table imported at the top of the file if a later edit needs it, and `rows` reads clearer next to `maxDate`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — including the existing `importBackupAction` tests, whose behaviour is unchanged.

- [ ] **Step 5: Gates + commit**

```bash
npm run format:files src/features/entries/actions.ts src/features/recurring/restore-rewind.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/actions.ts src/features/recurring/restore-rewind.test.ts
git commit -m "fix(features): refill recurring entries after a backup restore" -m "The Monefy CSV carries no rule id, so a replace-all restore leaves the ledger and the rules strangers — a rule claiming it posted through July against a ledger that stops in June would leave a silent, permanent hole." -m "Clamping every pointer to the CSV's newest date makes the next sweep refill the gap. Because the payment number derives from that pointer, installment seq numbers come back correct with no extra work."
```

---

### Task 9: Close the orphan holes — wipe and delete guards

**Files:**
- Modify: `src/features/settings/data.ts:11-13`
- Modify: `src/features/settings/data.test.ts`
- Modify: `src/features/entries/queries.ts:294-311` (`deleteCategory`) and `:445-459` (`deleteAccount`)
- Modify: `src/features/entries/queries.test.ts`

**Interfaces:**
- Consumes: `recurrences` from `@features/recurring/schema`
- Produces: no new exports; `wipeAllData`, `deleteCategory`, `deleteAccount` keep their signatures

**Why this task exists:** two real data bugs the feature introduces if left alone.

1. `wipeAllData` clears entries/budgets/categories but would leave rules behind — so a wipe would be
   immediately undone by the next sweep re-posting everything from each rule's `startDate`.
2. `deleteCategory`/`deleteAccount` only guard on *entries*. A brand-new rule that has never posted
   references a category with zero entries, so the category is deletable — leaving the rule pointing
   at a dangling id. The sweep would then insert entries whose `innerJoin` fails, and those rows
   **vanish from every read surface silently**. That is worse than an error.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/settings/data.test.ts` (match the existing file's `db()` helper; add `ensureRecurrencesTable` to it):

```ts
it('clears recurring rules too — otherwise the next sweep undoes the wipe', async () => {
  const d = await db();
  await addRule(d, {
    name: 'Rent',
    day: 1,
    intervalMonths: 1,
    accountId: 1,
    categoryId: 1,
    amount: 15000,
    currency: 'THB',
    startDate: '2026-07-01',
  });
  await wipeAllData(d);
  expect(await d.select().from(recurrences).all()).toEqual([]);
});
```

Add to `src/features/entries/queries.test.ts` (add `ensureRecurrencesTable` to its `db()` helper):

```ts
describe('delete guards protect recurring rules', () => {
  it('refuses to delete a category a rule points at, even with zero entries', async () => {
    const d = await db();
    const categoryId = await categoryIdFor(d, 'subscriptions');
    await addRule(d, {
      name: 'Netflix',
      day: 5,
      intervalMonths: 1,
      accountId: 1,
      categoryId,
      amount: 9.99,
      currency: 'USD',
      startDate: '2026-07-05',
    });
    await deleteCategory(d, 'subscriptions');
    expect(await getDistinctCategories(d)).toContain('subscriptions');
  });

  it('refuses to delete an account a rule points at, even with zero entries', async () => {
    const d = await db();
    const accountId = await accountIdFor(d, 'visa');
    await addRule(d, {
      name: 'Netflix',
      day: 5,
      intervalMonths: 1,
      accountId,
      categoryId: 1,
      amount: 9.99,
      currency: 'USD',
      startDate: '2026-07-05',
    });
    await deleteAccount(d, 'visa');
    expect(await getDistinctAccounts(d)).toContain('visa');
  });

  it('still deletes a category no rule and no entry references', async () => {
    const d = await db();
    await categoryIdFor(d, 'unused');
    await deleteCategory(d, 'unused');
    expect(await getDistinctCategories(d)).not.toContain('unused');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/settings/data.test.ts src/features/entries/queries.test.ts`
Expected: FAIL — the wipe leaves a rule behind; both deletes succeed when they should no-op.

- [ ] **Step 3: Clear rules on wipe**

Replace `src/features/settings/data.ts` entirely:

```ts
import type { Db } from '@db/client';
import { entries } from '@features/entries/schema';
import { categories } from '@features/categories/schema';
import { budgets } from '@features/budgets/schema';
import { recurrences } from '@features/recurring/schema';

// Irreversible "wipe all data": clears the whole ledger, all categories, their budgets, and every
// recurring rule in one transaction (no soft-delete — that's the point, and why the UI confirm-gates
// it). Entries and budgets reference categories, so they're deleted first.
//
// Rules MUST be cleared here: left behind, the next sweep would re-post every one of them from its
// startDate and quietly undo the wipe.
// ponytail: the accounts table is still not cleared here (pre-existing gap from the accounts
// feature); fold it in when someone touches this next.
export async function wipeAllData(db: Db): Promise<void> {
  await db.batch([
    db.delete(entries),
    db.delete(budgets),
    db.delete(recurrences),
    db.delete(categories),
  ]);
}
```

- [ ] **Step 4: Guard the deletes**

In `src/features/entries/queries.ts`, add to the imports at the top:

```ts
import { recurrences } from '@features/recurring/schema';
```

In `deleteCategory`, after the existing `used` check (`if (used) return;`), insert:

```ts
  // A rule that has never posted references a category with zero entries — so the entries guard
  // above does not see it. Deleting anyway would leave the rule pointing at a dangling id, and the
  // sweep's rows would then fail entryRowsQuery's innerJoin and vanish from every read surface
  // silently. Refuse instead.
  const ruled = await db
    .select({ id: recurrences.id })
    .from(recurrences)
    .where(eq(recurrences.categoryId, row.id))
    .get();
  if (ruled) return;
```

In `deleteAccount`, after its existing `if (used) return;`, insert the same guard against `accounts`:

```ts
  // Same reasoning as deleteCategory: a never-posted rule holds an account id the entries guard
  // cannot see, and a dangling account_id makes the sweep's rows vanish from every read surface.
  const ruled = await db
    .select({ id: recurrences.id })
    .from(recurrences)
    .where(eq(recurrences.accountId, row.id))
    .get();
  if (ruled) return;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/features/settings/data.test.ts src/features/entries/queries.test.ts`
Expected: PASS

- [ ] **Step 6: Gates + commit**

```bash
npm run format:files src/features/settings/data.ts src/features/settings/data.test.ts src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/settings/data.ts src/features/settings/data.test.ts src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "fix(features): stop recurring rules from outliving their category, account, or a wipe" -m "wipeAllData left rules behind, so the next sweep would re-post every one from its startDate and quietly undo the wipe." -m "deleteCategory/deleteAccount only guarded on entries, but a never-posted rule references a category with zero entries — deleting it left the rule pointing at a dangling id, and the sweep's rows then failed entryRowsQuery's innerJoin and vanished from every read surface with no error at all."
```

---

### Task 10: The rule form parser

**Files:**
- Create: `src/features/recurring/rule-form.ts`
- Create: `src/features/recurring/rule-form.test.ts`
- Create: `src/features/recurring/actions.ts`

**Interfaces:**
- Consumes: `NewRecurrence` (Task 1); `clampDay` (Task 2); `isCurrency` from `@features/entries/entry-form`; `categoryIdFor` from `@features/categories/queries`; `accountIdFor` from `@features/accounts/queries`; `addRule`, `updateRule`, `archiveRule` (Task 3); `getBrowserDb`, `bumpDataVersion`
- Produces:
  - `type RuleInput = { name: string; day: number; intervalMonths: number; account: string; category: string; amount: number; currency: string | null; rate: number | null; totalCount: number | null; startSeq: number; startDate: string }`
  - `type ParseResult = { ok: true; rule: RuleInput } | { ok: false; error: string }`
  - `parseRuleForm(formData: FormData, todayIso: string): ParseResult`
  - `addRuleAction(formData: FormData): Promise<void>`, `editRuleAction(formData: FormData): Promise<void>`, `archiveRuleAction(formData: FormData): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/features/recurring/rule-form.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseRuleForm } from './rule-form';

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const valid = {
  name: 'Netflix',
  day: '5',
  intervalMonths: '1',
  account: 'visa',
  category: 'subscriptions',
  amount: '9.99',
  currency: 'USD',
  rate: '',
  totalCount: '',
  startSeq: '1',
};

describe('parseRuleForm', () => {
  it('parses a valid subscription and derives startDate from the day', () => {
    const got = parseRuleForm(fd(valid), '2026-07-01');
    expect(got).toEqual({
      ok: true,
      rule: {
        name: 'Netflix',
        day: 5,
        intervalMonths: 1,
        account: 'visa',
        category: 'subscriptions',
        amount: 9.99,
        currency: 'USD',
        rate: null,
        totalCount: null,
        startSeq: 1,
        startDate: '2026-07-05',
      },
    });
  });

  it('starts NEXT month when this month\'s day has already passed', () => {
    // Today is the 20th; a rule on the 5th should not immediately back-post this month's 5th.
    const got = parseRuleForm(fd(valid), '2026-07-20');
    expect(got).toMatchObject({ ok: true, rule: { startDate: '2026-08-05' } });
  });

  it('starts today when the day IS today', () => {
    expect(parseRuleForm(fd(valid), '2026-07-05')).toMatchObject({
      ok: true,
      rule: { startDate: '2026-07-05' },
    });
  });

  it('pre-clamps startDate for a 31st rule starting in a short month', () => {
    expect(parseRuleForm(fd({ ...valid, day: '31' }), '2026-02-01')).toMatchObject({
      ok: true,
      rule: { day: 31, startDate: '2026-02-28' },
    });
  });

  it('parses an installment with a pinned rate', () => {
    expect(
      parseRuleForm(fd({ ...valid, totalCount: '12', startSeq: '4', rate: '36.5' }), '2026-07-01'),
    ).toMatchObject({ ok: true, rule: { totalCount: 12, startSeq: 4, rate: 36.5 } });
  });

  it('rejects a blank name', () => {
    expect(parseRuleForm(fd({ ...valid, name: '  ' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Give the rule a name.',
    });
  });

  it('rejects a day outside 1..31', () => {
    expect(parseRuleForm(fd({ ...valid, day: '32' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Day must be between 1 and 31.',
    });
    expect(parseRuleForm(fd({ ...valid, day: '0' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Day must be between 1 and 31.',
    });
  });

  it('rejects a non-positive amount — a rule is an expense', () => {
    expect(parseRuleForm(fd({ ...valid, amount: '0' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Amount must be greater than zero.',
    });
    expect(parseRuleForm(fd({ ...valid, amount: '-5' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Amount must be greater than zero.',
    });
  });

  it('rejects an unknown currency', () => {
    expect(parseRuleForm(fd({ ...valid, currency: 'XYZ' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose a valid currency.',
    });
  });

  it('rejects an interval other than monthly or yearly', () => {
    expect(parseRuleForm(fd({ ...valid, intervalMonths: '3' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose monthly or yearly.',
    });
  });

  it('rejects a startSeq past totalCount — nothing would ever post', () => {
    expect(
      parseRuleForm(fd({ ...valid, totalCount: '12', startSeq: '13' }), '2026-07-01'),
    ).toEqual({ ok: false, error: 'The next payment number is past the total.' });
  });

  it('rejects a blank account or category', () => {
    expect(parseRuleForm(fd({ ...valid, account: '' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose an account.',
    });
    expect(parseRuleForm(fd({ ...valid, category: '' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose a category.',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/recurring/rule-form.test.ts`
Expected: FAIL — `Failed to resolve import "./rule-form"`

- [ ] **Step 3: Write the parser**

Create `src/features/recurring/rule-form.ts`:

```ts
import { isCurrency } from '@features/entries/entry-form';
import { clampDay } from './schedule';

// Pure FormData → rule parser. Mirrors entries/entry-form.ts's shape: a discriminated result rather
// than a throw, so the form can render the message. Validation lives HERE, not in the <input min/max>
// — that only constrains well-behaved browsers.
//
// Carries account/category NAMES; the action resolves them to ids at the DB boundary, exactly as
// EntryInput does.

export type RuleInput = {
  name: string;
  day: number;
  intervalMonths: number;
  account: string;
  category: string;
  amount: number;
  currency: string | null;
  rate: number | null;
  totalCount: number | null;
  startSeq: number;
  startDate: string;
};

export type ParseResult = { ok: true; rule: RuleInput } | { ok: false; error: string };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

// An empty field means "not set" for the optional numerics (rate, totalCount).
function optionalNumber(formData: FormData, key: string): number | null {
  const raw = str(formData, key);
  return raw === '' ? null : Number(raw);
}

// The rule's first due date: this month's `day` if it has not passed yet, otherwise next month's.
// Pre-clamped, so a 31st rule starting in February stores '2026-02-28' while `day` stays 31 — which
// is what lets schedule.ts return to the 31st in March.
function firstDueDate(day: number, todayIso: string): string {
  const [y, m] = todayIso.split('-').map(Number);
  const thisMonth = clampDay(y, m, day);
  if (thisMonth >= todayIso) return thisMonth;
  const total = y * 12 + (m - 1) + 1;
  return clampDay(Math.floor(total / 12), (total % 12) + 1, day);
}

export function parseRuleForm(formData: FormData, todayIso: string): ParseResult {
  const name = str(formData, 'name');
  if (!name) return { ok: false, error: 'Give the rule a name.' };

  const account = str(formData, 'account');
  if (!account) return { ok: false, error: 'Choose an account.' };

  const category = str(formData, 'category');
  if (!category) return { ok: false, error: 'Choose a category.' };

  const day = Number(str(formData, 'day'));
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return { ok: false, error: 'Day must be between 1 and 31.' };
  }

  const intervalMonths = Number(str(formData, 'intervalMonths'));
  if (intervalMonths !== 1 && intervalMonths !== 12) {
    return { ok: false, error: 'Choose monthly or yearly.' };
  }

  const amount = Number(str(formData, 'amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }

  const currency = str(formData, 'currency');
  if (!isCurrency(currency)) return { ok: false, error: 'Choose a valid currency.' };

  const rate = optionalNumber(formData, 'rate');
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0)) {
    return { ok: false, error: 'A pinned rate must be greater than zero.' };
  }

  const totalCount = optionalNumber(formData, 'totalCount');
  if (totalCount !== null && (!Number.isInteger(totalCount) || totalCount < 1)) {
    return { ok: false, error: 'Number of payments must be a whole number of 1 or more.' };
  }

  const startSeqRaw = optionalNumber(formData, 'startSeq');
  const startSeq = startSeqRaw ?? 1;
  if (!Number.isInteger(startSeq) || startSeq < 1) {
    return { ok: false, error: 'The next payment number must be 1 or more.' };
  }
  if (totalCount !== null && startSeq > totalCount) {
    return { ok: false, error: 'The next payment number is past the total.' };
  }

  return {
    ok: true,
    rule: {
      name,
      day,
      intervalMonths,
      account,
      category,
      amount,
      currency,
      rate,
      totalCount,
      startSeq,
      startDate: firstDueDate(day, todayIso),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/recurring/rule-form.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 5: Write the actions**

Create `src/features/recurring/actions.ts`. Use the same `todayIso` helper found in Task 7 Step 1:

```ts
import { getBrowserDb } from '@db/browser';
import { categoryIdFor } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';
import { parseRuleForm, type RuleInput } from './rule-form';
import { addRule, updateRule, archiveRule } from './queries';
import type { NewRecurrence } from './schema';

// The feature's client-side write layer against the browser OPFS db — plain async functions, not
// Server Actions (there is no server). A failed parse throws; the caller's boundary surfaces it.
// Each successful write bumps the shared data-version so live read-hooks refetch.

// Resolve the input's account/category NAMES to ids at the DB boundary, exactly as entries' toRow does.
async function toRow(db: Awaited<ReturnType<typeof getBrowserDb>>, input: RuleInput): Promise<NewRecurrence> {
  const { account, category, ...rest } = input;
  return {
    ...rest,
    categoryId: await categoryIdFor(db, category),
    accountId: await accountIdFor(db, account),
  };
}

export async function addRuleAction(formData: FormData): Promise<void> {
  const result = parseRuleForm(formData, todayIso());
  if (!result.ok) throw new Error(result.error);
  const db = await getBrowserDb();
  await addRule(db, await toRow(db, result.rule));
  bumpDataVersion();
}

// Editing never touches lastPosted: the pointer is the sweep's alone. Changing an amount or rate
// affects FUTURE posts only — already-posted entries are ordinary ledger rows and stay as they were.
export async function editRuleAction(formData: FormData): Promise<void> {
  const result = parseRuleForm(formData, todayIso());
  if (!result.ok) throw new Error(result.error);
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await updateRule(db, id, await toRow(db, result.rule));
  bumpDataVersion();
}

export async function archiveRuleAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await archiveRule(db, id);
  bumpDataVersion();
}
```

- [ ] **Step 6: Gates + commit**

```bash
npm run format:files src/features/recurring/rule-form.ts src/features/recurring/rule-form.test.ts src/features/recurring/actions.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/rule-form.ts src/features/recurring/rule-form.test.ts src/features/recurring/actions.ts
git commit -m "feat(features): add the recurring rule form parser and write layer" -m "Pure FormData parser returning a discriminated result, mirroring entries/entry-form. Validation lives here, not in the input min/max — that only constrains well-behaved browsers." -m "startDate is derived and pre-clamped: this month's day if it has not passed, else next month's, so adding a rule on the 20th for the 5th does not immediately back-post. Editing never touches lastPosted — the pointer is the sweep's alone."
```

---

### Task 11: The `/recurring` page

**Files:**
- Create: `src/features/recurring/use-recurring.ts`
- Create: `src/features/recurring/use-recurring.test.ts`
- Create: `src/features/recurring/ui/RecurringList.tsx`
- Create: `src/features/recurring/ui/RuleForm.tsx`
- Create: `src/app/recurring/page.tsx`
- Modify: `src/shared/ui/MoreSheet.tsx`

**Interfaces:**
- Consumes: `listRules` (Task 3); `progressOf`, `type Progress` (Task 2); `useDataVersion` from `@shared/data-version`; `formatBaht`, `formatBahtWhole` from `@shared/money`; `addRuleAction`, `editRuleAction`, `archiveRuleAction` (Task 10)
- Produces:
  - `type RuleView = Recurrence & { progress: Progress; monthlyThb: number }`
  - `useRecurring(): { ready: boolean; rules: RuleView[]; monthlyTotal: number }`

- [ ] **Step 1: Read two existing surfaces before writing any UI**

Run:
```bash
rg -n "useDataVersion" src/features/budgets/use-budgets.ts
cat src/app/budgets/page.tsx
cat src/shared/ui/MoreSheet.tsx
```

`/budgets` is the closest existing analogue (a list page over a small table, reached from the More
sheet). **Follow its hook shape, its `ready` gating, its PageContainer usage, and its component
structure rather than inventing new patterns.** The global font rules apply: numbers render in the
app's sans with `font-variant-numeric: tabular-nums` — **never introduce a monospace font for
figures.**

- [ ] **Step 2: Write the failing hook test**

Create `src/features/recurring/use-recurring.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Recurrence } from './schema';

const listRules = vi.fn();
vi.mock('./queries', () => ({ listRules }));
vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn(async () => ({})) }));

function rule(over: Partial<Recurrence>): Recurrence {
  return {
    id: 1,
    name: 'Rent',
    day: 1,
    intervalMonths: 1,
    accountId: 1,
    categoryId: 1,
    amount: 15000,
    currency: 'THB',
    rate: null,
    totalCount: null,
    startSeq: 1,
    startDate: '2026-07-01',
    lastPosted: null,
    archived: 0,
    ...over,
  };
}

beforeEach(() => {
  listRules.mockReset();
});

describe('useRecurring', () => {
  it('starts not ready, then loads', async () => {
    listRules.mockResolvedValue([rule({})]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rules).toHaveLength(1);
  });

  it('attaches installment progress', async () => {
    listRules.mockResolvedValue([rule({ totalCount: 12, startSeq: 4 })]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.rules[0].progress).toEqual({ paid: 3, total: 12, remaining: 9 });
  });

  it('normalises a yearly rule to a monthly figure in the total', async () => {
    listRules.mockResolvedValue([
      rule({ id: 1, amount: 15000, intervalMonths: 1 }),
      rule({ id: 2, name: 'Domain', amount: 1200, intervalMonths: 12 }),
    ]);
    const { useRecurring } = await import('./use-recurring');
    const { result } = renderHook(() => useRecurring());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.monthlyTotal).toBe(15100); // 15000 + 1200/12
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/features/recurring/use-recurring.test.ts`
Expected: FAIL — `Failed to resolve import "./use-recurring"`

- [ ] **Step 4: Write the hook**

Create `src/features/recurring/use-recurring.ts`, matching `use-budgets.ts`'s shape from Step 1:

```ts
'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { useDataVersion } from '@shared/data-version';
import { listRules } from './queries';
import { progressOf, type Progress } from './schedule';
import type { Recurrence } from './schema';

export type RuleView = Recurrence & { progress: Progress; monthlyThb: number };

// A rule's contribution to the "committed per month" figure. A yearly rule is amortised; an FX rule
// is valued at its pinned rate, or skipped (0) when it has none — the header is a GLANCE figure, and
// hitting the network to price it would be absurd for a number that renders in whole baht.
function monthlyThbOf(rule: Recurrence): number {
  const thb = rule.currency === null || rule.currency === 'THB' ? rule.amount : rule.amount * (rule.rate ?? 0);
  return thb / rule.intervalMonths;
}

export function useRecurring(): { ready: boolean; rules: RuleView[]; monthlyTotal: number } {
  const version = useDataVersion();
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState<RuleView[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const db = await getBrowserDb();
      const rows = await listRules(db);
      if (!alive) return;
      setRules(rows.map((r) => ({ ...r, progress: progressOf(r), monthlyThb: monthlyThbOf(r) })));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  return { ready, rules, monthlyTotal: rules.reduce((sum, r) => sum + r.monthlyThb, 0) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/recurring/use-recurring.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 6: Build the page**

Create `src/features/recurring/ui/RecurringList.tsx` and `src/features/recurring/ui/RuleForm.tsx`,
then `src/app/recurring/page.tsx` as a thin `'use client'` route delegating to them — mirroring
`src/app/budgets/page.tsx`'s structure exactly.

The list renders, per rule:
- the category marker + the rule's `name`
- the amount: `formatBaht(rule.amount)` for a THB rule, or `${currency} ${amount}` for an FX one
- the day, as an ordinal (`5th`), and `/yr` when `intervalMonths === 12`
- for an installment (`progress.total !== null`): `${progress.paid} of ${progress.total} paid · ${progress.remaining} left`
- header: `Committed ${formatBahtWhole(monthlyTotal)} / month`
- an empty state when `rules.length === 0`, gated on `ready`
- `…` placeholder until `ready`

The form posts to `addRuleAction` / `editRuleAction`, with fields matching `parseRuleForm`'s keys
exactly: `name`, `day`, `intervalMonths`, `account`, `category`, `amount`, `currency`, `rate`,
`totalCount`, `startSeq` (and `id` for edit). Archive posts to `archiveRuleAction`, confirm-gated
via the existing ConfirmDialog primitive.

Constraints: 412px phone column, `.tap` 44px minimum touch targets, `font-variant-numeric:
tabular-nums` on every figure, no new font.

- [ ] **Step 7: Add the More sheet link**

In `src/shared/ui/MoreSheet.tsx`, add a `/recurring` entry alongside the existing budgets/categories/accounts links, matching their markup exactly.

- [ ] **Step 8: Verify the build**

Run: `npm run build:web`
Expected: build succeeds; `out/recurring/index.html` exists

- [ ] **Step 9: Gates + commit**

```bash
npm run format:files src/features/recurring/use-recurring.ts src/features/recurring/use-recurring.test.ts src/features/recurring/ui/RecurringList.tsx src/features/recurring/ui/RuleForm.tsx src/app/recurring/page.tsx src/shared/ui/MoreSheet.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/recurring/use-recurring.ts src/features/recurring/use-recurring.test.ts src/features/recurring/ui src/app/recurring src/shared/ui/MoreSheet.tsx
git commit -m "feat(app): add the /recurring page" -m "Lists standing rules with their monthly commitment total and installment progress, and is where a cancelled subscription gets noticed and archived — the cost of auto-posting." -m "The header total amortises yearly rules and values FX rules at their pinned rate only; it is a glance figure in whole baht, so pricing it over the network would be absurd."
```

---

### Task 12: Verify in a real browser

**Files:** none — this is the gate the test suite structurally cannot cover.

**Why:** tests run against the Node shim, so they prove the queries and **never** the worker, OPFS, or
layout. Two of this feature's three riskiest failures are invisible to `npm test`: the `worker.ts`
DDL drift (only `schema.test.ts`'s text guard hints at it) and the sweep actually firing on mount
against a real OPFS db.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev:web`
Open `http://127.0.0.1:4010` — note OPFS is per-origin, so `127.0.0.1:4010` and `localhost:4010` hold **separate** databases. Use the same origin throughout.

- [ ] **Step 2: Confirm the table exists in the real engine**

Open DevTools → Console. Confirm no `no such table: recurrences` error appears on load. This is the
DDL-lockstep check that only a browser can make.

- [ ] **Step 3: Drive the feature at 412px**

Set device toolbar to 412px wide. Then:

- [ ] Create a THB rule (Rent, ฿15,000, day 1, monthly) with a day **already past** this month → confirm it does NOT post immediately (startDate is next month).
- [ ] Create a THB rule with a day **in the future but this month** → confirm it does not post yet.
- [ ] Create a rule dated **today** → reload → confirm exactly one entry appears in Records dated today, with the right amount and a negative sign, and that the home donut/cycle total moved by that amount.
- [ ] Reload again → confirm **no duplicate** appears (idempotence against a real db).
- [ ] Create an installment (Fridge, ฿2,000, 12 payments, next is #4, day today) → reload → confirm the entry note reads `Fridge (4/12)` in Records, and the page reads `4 of 12 paid · 8 left`.
- [ ] Create an FX rule (Netflix, $9.99, day today) → reload → confirm it posts, the DevTools Network tab shows a `frankfurter.dev/v1/<today>` call (the **dated** endpoint, not `/latest`), and the stored THB looks right for the rate.
- [ ] Go offline (DevTools → Network → Offline), delete the FX entry, clear the rule's `lastPosted` (via the page: archive + recreate), reload → confirm it still posts at the cached rate rather than blocking.
- [ ] Try to delete the category the Netflix rule uses, from `/categories` → confirm it refuses.
- [ ] Settings → Backup → export a CSV. Add a later entry. Restore the exported CSV → reload → confirm recurring entries after the backup's date are refilled and the installment numbering is still correct.

- [ ] **Step 4: Confirm the whole suite and build are green**

```bash
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web
```

- [ ] **Step 5: Commit any fixes found**

If the browser surfaced a defect the tests missed, fix it **and add the test that would have caught
it** before committing. A browser-only fix with no test is how the next drift gets through.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| One new table, DDL in two places | 1 |
| Single pointer, everything derives | 1 (schema), 2 (derivation) |
| `clampDay`, `duePosts`, `seqOf`, `progressOf` | 2 |
| Auto-post, dated the due date | 6, 7 |
| Sweep on app open, memoized, `bumpDataVersion` | 7 |
| Live ECB rate for the due date | 4, 5 |
| Pinned rate overrides | 5 |
| Cached-rate fallback, never block | 5, 6 |
| `(4/12)` in the note | 2 (`noteFor`), 6 |
| Monthly + yearly | 2, 10 |
| Restore rewind | 3 (`rewindRecurrences`), 8 |
| `/recurring` page, More sheet | 11 |
| Testing section | 2, 3, 5, 6, 12 |
| Browser verification at 412px | 12 |

**Gaps found and closed during review:**

- The spec did not mention `wipeAllData` or the delete guards. Both are real bugs the feature
  introduces (a wipe undone by the next sweep; a dangling FK making entries vanish silently through
  `entryRowsQuery`'s `innerJoin`). **Added as Task 9.**
- The spec did not specify how `startDate` is chosen when a rule is created. Left implicit, an
  implementer would plausibly back-post the current month. **Pinned in Task 10** (`firstDueDate`):
  this month's day if it has not passed, else next month's, pre-clamped.

**Type consistency:** `Rule` (schedule.ts, structural) vs `Recurrence` ($inferSelect) — the latter is
assignable to the former, verified by Task 2's tests using `Rule` literals and Task 6 passing full
rows. `Due { date, seq }` is produced by `duePosts` and consumed by `runSweep`. `PostRow` is produced
by Task 3 and consumed by Task 6. `RateRule` is structurally satisfied by `Recurrence`. `RuleInput`
(names) → `NewRecurrence` (ids) via `toRow` in Task 10, mirroring `EntryInput` → row in
`entries/queries.ts`.

**Known ceilings carried from the spec:** `(4/12)` is a written string and does not re-sync if the
note is hand-edited; the ledger is only as current as the last app open; a cancelled subscription
keeps posting until archived; the page's monthly total values FX rules at their pinned rate only.
