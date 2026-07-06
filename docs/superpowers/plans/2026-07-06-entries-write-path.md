# Entries Write Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only ledger (Slice 1's Monefy import + cycle dashboard) into one the user can maintain by hand — add, edit, and delete entries — via a pure form parser, six single-row queries, three Server Actions, one reusable form component, two routes, and edit/delete affordances on the dashboard's ledger table.

**Architecture:** A pure, unit-tested `entry-form.ts` turns raw `FormData` into a validated `NewEntry`. Single-row `queries.ts` functions (insert/update/delete/getById + distinct lists) sit alongside the existing whole-table and cycle-scoped reads. `actions.ts` is the first module in this codebase allowed to import Next's mutation APIs (`revalidatePath`, `redirect`) — it wires parser → query → cache invalidation → navigation. One client `EntryForm` is reused for both add and edit, rendered by two thin server-component routes. The dashboard's `LedgerTable` gains an Edit link and a Delete form per row. All work stays inside `src/features/entries/` plus two new routes under `src/app/entries/`; the dependency arrow stays `features → shared/db`.

**Tech Stack:** TypeScript (ESM, strict) · better-sqlite3 + drizzle-orm · Next 16 App Router (React 19 Server Components + Server Actions) · Vitest.

---

## Conventions (read before starting)

- **Tests:** Vitest `describe/it/expect`; DB tests use `initDb(':memory:')` then `ensureEntriesTable(db)`.
- **TS bans (enforced as lint errors):** no `any`, no `as` casts, no `!`, no ts-comments. `as const` and `sql<T>` generics are allowed. Prefer `type` over `interface`, `for..of` over `forEach`.
- **Path aliases:** `@db/*`, `@features/*`, `@shared/*`.
- **Server Actions (new pattern this slice):** `src/features/entries/actions.ts` begins with the file-level `'use server'` directive, so every exported async function becomes a Server Action. Each: `initDb()` → `ensureEntriesTable(db)` → parse/validate → call a write query → `revalidatePath('/dashboard')` (from `next/cache`) → for submit-and-navigate flows, `redirect('/dashboard')` (from `next/navigation`). better-sqlite3 already sits in `next.config.ts`'s `serverExternalPackages`, so it runs fine inside a Server Action.
- **No unit tests for Server/Client Components, Server Actions, or routes** — this repo's existing convention (see Slice 1's `CycleSelector`/dashboard page): verify with `npm run typecheck && npm run lint`, then `npm run build:web`, then a manual `npm run dev:web` smoke-check.
- **Run a single test file:** `npm test -- src/features/entries/<file>.test.ts`
- **Imports stay at the top, merged:** when a step says "append a test" that imports from a module already imported in that file, add the new names to the existing `import { … } from './x'` line rather than writing a second import statement (avoids `import/first` and `import/no-duplicates` lint errors). Likewise, add new `import` lines only at the top of a source file.
- **Gates before every commit:** `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. All must pass.
- **Commit style:** `type(scope): subject` with `-m` body. Scopes here: `features`, `app`. Footer lines:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/features/entries/schema.ts` | modify | Add nullable `time` column (drizzle table + DDL) |
| `src/features/entries/entries.test.ts` | modify | Round-trip test for `time` |
| `src/features/entries/queries.ts` | modify | Fix `getRecentEntries` ordering; add single-row insert/update/delete/getById + distinct lists |
| `src/features/entries/queries.test.ts` | modify | Tests for the above |
| `src/features/entries/entry-form.ts` | create | Pure: `FormData` → validated `NewEntry` |
| `src/features/entries/entry-form.test.ts` | create | Parser validation tests |
| `src/features/entries/actions.ts` | create | Server Actions: add / edit / delete |
| `src/features/entries/ui/EntryForm.tsx` | create | Client form, reused for add + edit |
| `src/features/entries/ui/LedgerTable.tsx` | modify | Add Edit link + Delete form per row |
| `src/app/entries/new/page.tsx` | create | Add-entry route |
| `src/app/entries/[id]/edit/page.tsx` | create | Edit-entry route, 404 if missing |
| `src/app/dashboard/page.tsx` | modify | "＋ Add entry" header link |

---

## Task 1: Schema — `time` column + `getRecentEntries` ordering

**Files:**
- Modify: `src/features/entries/schema.ts`
- Modify: `src/features/entries/entries.test.ts`
- Modify: `src/features/entries/queries.ts`
- Modify: `src/features/entries/queries.test.ts`

- [ ] **Step 1: Write the failing test** — add to the existing `describe` block in `entries.test.ts` (after the currency test):

```ts
it('stores an optional time alongside the date', () => {
  const db = initDb(':memory:');
  ensureEntriesTable(db);
  addEntries(db, [
    { date: '2026-07-06', time: '08:15', account: 'cash', category: 'coffee', amount: -80 },
    { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -60 }, // no time
  ]);
  const [withTime, withoutTime] = getEntries(db);
  expect(withTime.time).toBe('08:15');
  expect(withoutTime.time).toBeNull();
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/entries.test.ts`
Expected: FAIL — TS error / `time` not a known property on the insert shape.

- [ ] **Step 3: Add the column** — in `src/features/entries/schema.ts`, full new file body:

```ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// The money-flow ledger — one row per inflow/outflow. `amount` is signed THB (the converted
// value) and is the basis for every rollup. `currency` + `originalAmount` preserve the source
// currency for non-THB rows (JPY/HKD) so the import is lossless; they are informational only.
// `time` is a nullable 24h 'HH:MM' — imported rows rarely carry one, hand-entered rows may.
// This file is the schema source of truth; after any edit here, re-run `npm run db:generate`.
export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time'), // 24h 'HH:MM', nullable
  account: text('account').notNull(),
  category: text('category').notNull(),
  amount: real('amount').notNull(), // signed THB (converted)
  currency: text('currency'), // original currency, e.g. 'THB' | 'JPY'
  originalAmount: real('original_amount'), // signed amount in the original currency
  note: text('note'),
});

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;

// ponytail: scaffold bootstraps the table with CREATE TABLE IF NOT EXISTS instead of a
// drizzle-kit migration runner. Upgrade path when the schema stops being trivial: generate
// committed migrations (`npm run db:generate`) and replay them at the composition root.
export function ensureEntriesTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT,
      account TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT,
      original_amount REAL,
      note TEXT
    )
  `);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/entries.test.ts`
Expected: PASS (all three tests in the file).

- [ ] **Step 5: Write the failing test for ordering** — append a new `describe` block to `queries.test.ts`; add `getRecentEntries` to the existing `import { … } from './queries'` block:

```ts
import {
  addEntries,
  getEntries,
  getRecentEntries,
  replaceEntries,
  getCycleSummary,
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
} from './queries';
```

```ts
describe('getRecentEntries', () => {
  it('orders by date desc, then time desc, then id desc — untimed rows sort last', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', time: '09:00', account: 'cash', category: 'food', amount: -10 },
      { date: '2026-07-01', time: '18:30', account: 'cash', category: 'food', amount: -20 },
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -5 }, // no time
      { date: '2026-07-02', account: 'cash', category: 'food', amount: -1 }, // no time
    ]);
    const rows = getRecentEntries(db, 10);
    expect(rows.map((r) => [r.date, r.time])).toEqual([
      ['2026-07-02', null],
      ['2026-07-01', '18:30'],
      ['2026-07-01', '09:00'],
      ['2026-07-01', null],
    ]);
  });
});
```

- [ ] **Step 6: Run it, verify it fails**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — the expected order doesn't match (the pre-fix query only orders by `date, id`, so the two 2026-07-01 rows without an explicit ordering guarantee between `09:00` and `18:30` come out in insertion order, not time order).

- [ ] **Step 7: Fix the ordering** — in `src/features/entries/queries.ts`, replace:

```ts
export function getRecentEntries(db: Db, limit = 8): Entry[] {
  return db.select().from(entries).orderBy(desc(entries.date), desc(entries.id)).limit(limit).all();
}
```

with:

```ts
export function getRecentEntries(db: Db, limit = 8): Entry[] {
  return db
    .select()
    .from(entries)
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .limit(limit)
    .all();
}
```

- [ ] **Step 8: Run it, verify it passes**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS. Also run the whole suite to confirm nothing else regressed:
Run: `npm test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
npm run format:files src/features/entries/schema.ts src/features/entries/entries.test.ts src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/schema.ts src/features/entries/entries.test.ts src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): add nullable time column and order recent entries by it" -m "Hand-entered rows may carry a 24h HH:MM time; imported rows mostly won't. getRecentEntries now orders date desc, time desc, id desc so same-day rows sort by time-of-day before falling back to insertion order; untimed rows sort last under SQLite's NULL-is-smallest DESC behavior." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 2: Pure form parser (`entry-form.ts`)

Translates raw `FormData` into a validated `NewEntry`, or a human-readable error. No DB, no Next imports — the Server Action in Task 4 is the only thing that touches the database.

**Files:**
- Create: `src/features/entries/entry-form.ts`
- Create: `src/features/entries/entry-form.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/features/entries/entry-form.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEntryForm, CURRENCIES } from './entry-form';

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.set(key, value);
  }
  return fd;
}

const base = {
  direction: 'expense',
  account: 'cash',
  currency: 'THB',
  amount: '120',
  thb: '120',
  category: 'food',
  date: '2026-07-06',
  time: '',
  note: '',
};

describe('CURRENCIES', () => {
  it('includes THB and the trip currencies', () => {
    expect(CURRENCIES).toContain('THB');
    expect(CURRENCIES).toContain('JPY');
  });
});

describe('parseEntryForm', () => {
  it('parses a THB expense — thb equals amount, blank time/note become null', () => {
    const result = parseEntryForm(formData(base));
    expect(result).toEqual({
      ok: true,
      entry: {
        date: '2026-07-06',
        time: null,
        account: 'cash',
        category: 'food',
        amount: -120,
        currency: 'THB',
        originalAmount: -120,
        note: null,
      },
    });
  });

  it('parses a JPY expense with a separately-typed THB conversion', () => {
    const result = parseEntryForm(
      formData({
        ...base,
        currency: 'JPY',
        amount: '1000',
        thb: '230',
        account: 'jpy wallet',
        category: 'ramen',
        date: '2026-03-20',
        time: '19:45',
        note: 'dinner',
      }),
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        date: '2026-03-20',
        time: '19:45',
        account: 'jpy wallet',
        category: 'ramen',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: 'dinner',
      },
    });
  });

  it('flips the sign for income', () => {
    const result = parseEntryForm(
      formData({ ...base, direction: 'income', category: 'salary', amount: '50000', thb: '50000' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry.amount).toBe(50000);
      expect(result.entry.originalAmount).toBe(50000);
    }
  });

  it('rejects an empty account', () => {
    expect(parseEntryForm(formData({ ...base, account: '' }))).toEqual({
      ok: false,
      error: 'Account is required.',
    });
  });

  it('rejects an empty category', () => {
    expect(parseEntryForm(formData({ ...base, category: '' }))).toEqual({
      ok: false,
      error: 'Category is required.',
    });
  });

  it('rejects an empty date', () => {
    expect(parseEntryForm(formData({ ...base, date: '' }))).toEqual({
      ok: false,
      error: 'Date is required.',
    });
  });

  it('rejects a currency outside the allowed set', () => {
    expect(parseEntryForm(formData({ ...base, currency: 'BTC' }))).toEqual({
      ok: false,
      error: 'Choose a valid currency.',
    });
  });

  it('rejects a non-positive or non-numeric amount', () => {
    expect(parseEntryForm(formData({ ...base, amount: '0' }))).toEqual({
      ok: false,
      error: 'Amount must be a positive number.',
    });
    expect(parseEntryForm(formData({ ...base, amount: 'abc' }))).toEqual({
      ok: false,
      error: 'Amount must be a positive number.',
    });
  });

  it('rejects a non-positive THB amount when the currency is not THB', () => {
    expect(
      parseEntryForm(formData({ ...base, currency: 'JPY', amount: '1000', thb: '0' })),
    ).toEqual({ ok: false, error: 'THB amount must be a positive number.' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/entry-form.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — create `src/features/entries/entry-form.ts`:

```ts
import type { NewEntry } from './schema';

// Every currency the ledger's data has seen (Monefy export + manual entries). THB is home
// currency; the rest need a manual THB conversion since there's no live FX lookup (deferred).
export const CURRENCIES = ['THB', 'JPY', 'KRW', 'USD', 'EUR', 'HKD', 'GBP', 'SGD'] as const;
export type Currency = (typeof CURRENCIES)[number];

const currencySet = new Set<string>(CURRENCIES);

function isCurrency(value: string): value is Currency {
  return currencySet.has(value);
}

export type ParseResult = { ok: true; entry: NewEntry } | { ok: false; error: string };

function readString(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

// Pure: FormData → a validated NewEntry, or a human-readable error. No DB, no Next imports — the
// Server Action calling this is the only thing that touches the database. `amount` is the
// original-currency figure the user typed; `thb` is the THB-converted figure. For THB rows the
// two are equal by construction (the form never shows a second field for them), so `thb` is
// derived from `amount` in that branch rather than trusted from the form; only non-THB rows
// validate `thb` independently.
export function parseEntryForm(fd: FormData): ParseResult {
  const account = readString(fd, 'account');
  const category = readString(fd, 'category');
  const date = readString(fd, 'date');
  const time = readString(fd, 'time');
  const note = readString(fd, 'note');
  const currency = readString(fd, 'currency');
  const direction = readString(fd, 'direction') === 'income' ? 'income' : 'expense';

  if (account === '') return { ok: false, error: 'Account is required.' };
  if (category === '') return { ok: false, error: 'Category is required.' };
  if (date === '') return { ok: false, error: 'Date is required.' };
  if (!isCurrency(currency)) return { ok: false, error: 'Choose a valid currency.' };

  const amount = Number(readString(fd, 'amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Amount must be a positive number.' };
  }

  let thb = amount;
  if (currency !== 'THB') {
    thb = Number(readString(fd, 'thb'));
    if (!Number.isFinite(thb) || thb <= 0) {
      return { ok: false, error: 'THB amount must be a positive number.' };
    }
  }

  const sign = direction === 'income' ? 1 : -1;
  const entry: NewEntry = {
    date,
    time: time === '' ? null : time,
    account,
    category,
    amount: sign * thb,
    currency,
    originalAmount: sign * amount,
    note: note === '' ? null : note,
  };
  return { ok: true, entry };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/entry-form.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/entry-form.ts src/features/entries/entry-form.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/entry-form.ts src/features/entries/entry-form.test.ts
git commit -m "feat(features): add pure entry-form parser" -m "parseEntryForm validates raw FormData into a NewEntry (account/category/date required, currency must be one of CURRENCIES, amount positive, thb independently validated only for non-THB currencies) or returns a human-readable error. Pure and DB-free so the Server Action layer stays a thin wrapper." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 3: Single-row write queries

Add insert/update/delete/getById and the two distinct-value lists the form's datalists need.

**Files:**
- Modify: `src/features/entries/queries.ts`
- Modify: `src/features/entries/queries.test.ts`

- [ ] **Step 1: Write the failing tests** — add the new names to the existing `import { … } from './queries'` block in `queries.test.ts`:

```ts
import {
  addEntries,
  getEntries,
  getRecentEntries,
  replaceEntries,
  getCycleSummary,
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
  insertEntry,
  updateEntry,
  deleteEntry,
  getEntryById,
  getDistinctCategories,
  getDistinctAccounts,
} from './queries';
```

Append these `describe` blocks:

```ts
describe('single-row write queries', () => {
  it('inserts, then reads the row back by id (including time + currency)', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    insertEntry(db, {
      date: '2026-07-06',
      time: '08:15',
      account: 'cash',
      category: 'coffee',
      amount: -80,
      currency: 'THB',
      originalAmount: -80,
      note: 'morning latte',
    });
    const [row] = getEntries(db);
    const found = getEntryById(db, row.id);
    expect(found).toEqual(row);
    expect(found?.time).toBe('08:15');
    expect(found?.currency).toBe('THB');
  });

  it('returns undefined for a missing id', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    expect(getEntryById(db, 999)).toBeUndefined();
  });

  it('updates every column of an existing row', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    insertEntry(db, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = getEntries(db);
    updateEntry(db, row.id, {
      date: '2026-07-07',
      time: '09:00',
      account: 'visa',
      category: 'brunch',
      amount: -450,
      currency: 'THB',
      originalAmount: -450,
      note: 'updated',
    });
    expect(getEntryById(db, row.id)).toEqual({
      id: row.id,
      date: '2026-07-07',
      time: '09:00',
      account: 'visa',
      category: 'brunch',
      amount: -450,
      currency: 'THB',
      originalAmount: -450,
      note: 'updated',
    });
  });

  it('deletes a row by id', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    insertEntry(db, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = getEntries(db);
    deleteEntry(db, row.id);
    expect(getEntries(db)).toHaveLength(0);
  });
});

describe('getDistinctCategories / getDistinctAccounts', () => {
  it('returns sorted, de-duplicated lists', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-02', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'visa', category: 'travel', amount: -1 },
    ]);
    expect(getDistinctCategories(db)).toEqual(['food', 'travel']);
    expect(getDistinctAccounts(db)).toEqual(['cash', 'visa']);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — the new functions aren't exported.

- [ ] **Step 3: Implement** — change the top import line in `src/features/entries/queries.ts` to add `eq`:

```ts
import { desc, and, gte, lte, sql, eq } from 'drizzle-orm';
```

Append to the end of the file:

```ts
export function insertEntry(db: Db, entry: NewEntry): void {
  db.insert(entries).values(entry).run();
}

export function updateEntry(db: Db, id: number, entry: NewEntry): void {
  db.update(entries).set(entry).where(eq(entries.id, id)).run();
}

export function deleteEntry(db: Db, id: number): void {
  db.delete(entries).where(eq(entries.id, id)).run();
}

export function getEntryById(db: Db, id: number): Entry | undefined {
  return db.select().from(entries).where(eq(entries.id, id)).get();
}

export function getDistinctCategories(db: Db): string[] {
  return db
    .selectDistinct({ category: entries.category })
    .from(entries)
    .orderBy(entries.category)
    .all()
    .map((r) => r.category);
}

export function getDistinctAccounts(db: Db): string[] {
  return db
    .selectDistinct({ account: entries.account })
    .from(entries)
    .orderBy(entries.account)
    .all()
    .map((r) => r.account);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS. Also run the whole suite:
Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): add single-row write queries and distinct lookups" -m "insertEntry/updateEntry/deleteEntry/getEntryById give the write path CRUD on one row; getDistinctCategories/getDistinctAccounts back the entry form's choose-or-type-new datalists." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 4: Server Actions (`actions.ts`)

The first module in this codebase allowed to import Next's mutation APIs. No unit test — Server Actions require a request/module context Vitest doesn't provide; verified via the routes in Task 6 and the ledger affordances in Task 7.

**Files:**
- Create: `src/features/entries/actions.ts`

- [ ] **Step 1: Implement** — create `src/features/entries/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { parseEntryForm } from './entry-form';
import { insertEntry, updateEntry, deleteEntry } from './queries';

// The only feature module allowed to import Next's mutation APIs. Each action: open the DB,
// parse + validate the form, write, invalidate the dashboard's cache, and (for add/edit)
// navigate back to it. A failed parse throws — Next surfaces it via the nearest error boundary;
// a friendlier inline message is deferred (single-user local app, low stakes).
export async function addEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const result = parseEntryForm(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  insertEntry(db, result.entry);
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function editEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const id = Number(formData.get('id'));
  const result = parseEntryForm(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  updateEntry(db, id, result.entry);
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const id = Number(formData.get('id'));
  deleteEntry(db, id);
  revalidatePath('/dashboard');
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (`npm test` also still passes — this file has no tests of its own.)

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/entries/actions.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/actions.ts
git commit -m "feat(features): add Server Actions for add/edit/delete entry" -m "addEntryAction/editEntryAction/deleteEntryAction wire parseEntryForm to the single-row write queries: parse -> validate -> write -> revalidatePath('/dashboard') -> redirect for add/edit. First module in the codebase to touch Next's mutation APIs; verified end-to-end via the routes and ledger affordances in the following tasks." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 5: `EntryForm` client component

The one interactive component this slice introduces. No unit test (client component with local state) — verified visually via the routes in Task 6.

**Files:**
- Create: `src/features/entries/ui/EntryForm.tsx`

- [ ] **Step 1: Implement** — create `src/features/entries/ui/EntryForm.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import { CURRENCIES } from '../entry-form';
import type { Entry } from '../schema';

type EntryFormProps = {
  action: (formData: FormData) => Promise<void>;
  accounts: string[];
  categories: string[];
  entry?: Entry;
};

const fieldClass = 'rounded-[var(--radius-sm)] border px-3 py-2';
const fieldStyle = { borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' };

// Add/edit form for a single ledger row, reused by both routes. Controlled only where behavior
// demands it (currency <-> manual THB field); everything else is an uncontrolled
// <form action={action}> submit straight to a Server Action — no useActionState, matching the
// dashboard's no-client-JS-unless-needed stance as closely as a mutable form allows.
export function EntryForm({ action, accounts, categories, entry }: EntryFormProps) {
  const [currency, setCurrency] = useState(entry?.currency ?? 'THB');
  const accountListId = useId();
  const categoryListId = useId();
  const needsManualThb = currency !== 'THB';

  return (
    <form action={action} className="panel flex flex-col gap-4 p-5">
      {entry ? <input type="hidden" name="id" value={entry.id} /> : null}

      <fieldset className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="direction"
            value="expense"
            defaultChecked={entry ? entry.amount < 0 : true}
          />
          Expense
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="direction"
            value="income"
            defaultChecked={entry ? entry.amount > 0 : false}
          />
          Income
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Account
          <input
            name="account"
            list={accountListId}
            defaultValue={entry?.account ?? ''}
            required
            className={fieldClass}
            style={fieldStyle}
          />
          <datalist id={accountListId}>
            {accounts.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Category
          <input
            name="category"
            list={categoryListId}
            defaultValue={entry?.category ?? ''}
            required
            className={fieldClass}
            style={fieldStyle}
          />
          <datalist id={categoryListId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Currency
          <select
            name="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={fieldClass}
            style={fieldStyle}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          {needsManualThb ? `Amount (${currency})` : 'Amount (THB)'}
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={entry ? Math.abs(entry.originalAmount ?? entry.amount) : undefined}
            required
            className={`tnum ${fieldClass}`}
            style={fieldStyle}
          />
        </label>

        {needsManualThb ? (
          <label className="flex flex-col gap-1 text-sm">
            THB amount
            <input
              name="thb"
              type="number"
              step="0.01"
              min="0"
              defaultValue={entry ? Math.abs(entry.amount) : undefined}
              required
              className={`tnum ${fieldClass}`}
              style={fieldStyle}
            />
          </label>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          Date
          <input
            name="date"
            type="date"
            defaultValue={entry?.date ?? ''}
            required
            className={`tnum ${fieldClass}`}
            style={fieldStyle}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Time
          <input
            name="time"
            type="time"
            defaultValue={entry?.time ?? ''}
            className={`tnum ${fieldClass}`}
            style={fieldStyle}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Note
        <input
          name="note"
          defaultValue={entry?.note ?? ''}
          className={fieldClass}
          style={fieldStyle}
        />
      </label>

      <button type="submit" className="btn btn-primary self-start">
        {entry ? 'Save changes' : 'Add entry'}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/entries/ui/EntryForm.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/EntryForm.tsx
git commit -m "feat(app): add EntryForm client component for add/edit" -m "One reusable form: controlled currency select reveals a manual THB field only for non-THB rows, account/category use input+datalist for choose-or-type-new, direction defaults to expense. Renders a plain <form action> straight to a Server Action; pre-fills every field (plus a hidden id) when editing." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 6: `/entries/new` and `/entries/[id]/edit` routes

**Files:**
- Create: `src/app/entries/new/page.tsx`
- Create: `src/app/entries/[id]/edit/page.tsx`

- [ ] **Step 1: Create the add-entry route** — `src/app/entries/new/page.tsx`:

```tsx
// Reads the local SQLite DB per request for the datalists, so opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctAccounts, getDistinctCategories } from '@features/entries/queries';
import { addEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';

export default async function NewEntryPage() {
  const db = initDb();
  ensureEntriesTable(db);
  const accounts = getDistinctAccounts(db);
  const categories = getDistinctCategories(db);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Add entry</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Record a new inflow or outflow.
        </p>
      </header>
      <EntryForm action={addEntryAction} accounts={accounts} categories={categories} />
    </div>
  );
}
```

- [ ] **Step 2: Create the edit-entry route** — `src/app/entries/[id]/edit/page.tsx`:

```tsx
// Reads the local SQLite DB per request, so opt out of static generation.
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getDistinctAccounts,
  getDistinctCategories,
  getEntryById,
} from '@features/entries/queries';
import { editEntryAction } from '@features/entries/actions';
import { EntryForm } from '@features/entries/ui/EntryForm';

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = initDb();
  ensureEntriesTable(db);
  const entry = getEntryById(db, Number(id));
  if (!entry) {
    notFound();
  }
  const accounts = getDistinctAccounts(db);
  const categories = getDistinctCategories(db);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Edit entry</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Update this ledger row.
        </p>
      </header>
      <EntryForm action={editEntryAction} accounts={accounts} categories={categories} entry={entry} />
    </div>
  );
}
```

- [ ] **Step 3: Build to catch type/route errors**

Run: `npm run build:web`
Expected: build succeeds, compiling `/entries/new` and `/entries/[id]/edit`, no type errors.

- [ ] **Step 4: Verify in the running app** — `npm run dev:web`, then in a browser:
  1. Open `http://127.0.0.1:4001/entries/new`. Fill in account, category, a THB amount, date;
     submit. Expected: redirected to `/dashboard`; the new entry's totals/breakdowns reflect it
     (open the cycle it falls into if it isn't the current one).
  2. Change the currency to `JPY` on a fresh visit to `/entries/new`. Expected: a second
     "THB amount" field appears; submitting with both filled succeeds the same way.
  3. From `/dashboard`, manually visit `/entries/<id>/edit` for an id that exists (check the
     data or the CLI's `summary` output for a valid range). Expected: the form is pre-filled;
     changing a field and submitting redirects to `/dashboard` with the change reflected.
  4. Visit `/entries/999999/edit` (an id that doesn't exist). Expected: Next's 404 page.

  Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx"
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/entries/new/page.tsx "src/app/entries/[id]/edit/page.tsx"
git commit -m "feat(app): add entries/new and entries/[id]/edit routes" -m "Two thin server components: /entries/new loads the distinct account/category lists and renders EntryForm bound to addEntryAction; /entries/[id]/edit fetches the row (404 if missing) and binds EntryForm to editEntryAction, pre-filled." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 7: Ledger edit/delete affordances

Add an Actions column to the dashboard's `LedgerTable`: an Edit link per row and a tiny Delete form.

**Files:**
- Modify: `src/features/entries/ui/LedgerTable.tsx`

- [ ] **Step 1: Rewrite the component** — full new `src/features/entries/ui/LedgerTable.tsx`:

```tsx
import Link from 'next/link';
import { formatSignedBaht } from '@shared/money';
import { formatDay } from '@shared/date';
import { deleteEntryAction } from '../actions';
import type { Entry } from '../schema';

// Recent entries, densest-legible. Amount is mono, right-aligned, signed AND colored so meaning
// survives grayscale. The panel clips the horizontal scroll on narrow viewports (structural
// responsive, not fluid type). Actions column: Edit navigates to the edit route; Delete posts
// straight to deleteEntryAction — both work without any client JS of their own.
export function LedgerTable({ entries }: { entries: Entry[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-semibold">Recent entries</h2>
        <span className="chip">last {entries.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
              <Th className="text-left">Date</Th>
              <Th className="text-left">Category</Th>
              <Th className="text-left">Account</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-t transition-colors duration-150 hover:bg-[var(--color-surface-2)]"
              >
                <td
                  className="tnum px-5 py-3 whitespace-nowrap"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {formatDay(e.date)}
                </td>
                <td className="px-5 py-3">
                  <span className="chip">{e.category}</span>
                </td>
                <td className="px-5 py-3" style={{ color: 'var(--color-muted)' }}>
                  {e.account}
                </td>
                <td
                  className="tnum px-5 py-3 text-right font-medium whitespace-nowrap"
                  style={{ color: e.amount < 0 ? 'var(--color-loss)' : 'var(--color-gain)' }}
                >
                  {formatSignedBaht(e.amount)}
                </td>
                <td className="px-5 py-3 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    <Link
                      href={`/entries/${e.id}/edit`}
                      className="hover:underline"
                      style={{ color: 'var(--color-accent-text)' }}
                    >
                      Edit
                    </Link>
                    <form action={deleteEntryAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="hover:underline"
                        style={{ color: 'var(--color-loss)' }}
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-2.5 text-xs font-medium ${className}`}>{children}</th>;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Verify in the running app** — `npm run dev:web`, open `/dashboard`:
  1. Confirm each ledger row now shows Edit and Delete in a new Actions column.
  2. Click Edit on a row: expected to land on `/entries/<id>/edit` pre-filled with that row's
     values.
  3. Click Delete on a row: expected to stay on `/dashboard` with that row gone from the table
     and the summary/breakdown figures updated (no full page reload needed —
     `revalidatePath('/dashboard')` handles it).

  Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/features/entries/ui/LedgerTable.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/LedgerTable.tsx
git commit -m "feat(features): add edit/delete affordances to the ledger table" -m "Each row gets an Edit link to /entries/[id]/edit and a Delete form posting directly to deleteEntryAction, both working without dedicated client JS." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 8: "＋ Add entry" link on the dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add the header link** — in `src/app/dashboard/page.tsx`, add the import:

```tsx
import Link from 'next/link';
```

Replace the `<header>` block:

```tsx
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Your money flow for the {cycle.label} billing cycle.
        </p>
      </header>
```

with:

```tsx
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Your money flow for the {cycle.label} billing cycle.
          </p>
        </div>
        <Link href="/entries/new" className="btn btn-primary">
          ＋ Add entry
        </Link>
      </header>
```

- [ ] **Step 2: Build + full suite**

Run: `npm run build:web && npm test`
Expected: build succeeds, all tests PASS.

- [ ] **Step 3: End-to-end verification** — `npm run dev:web`, open `/dashboard`:
  1. Confirm the "＋ Add entry" button appears next to the title and links to `/entries/new`.
  2. Add an entry, confirm redirect back to `/dashboard` with updated figures.
  3. Edit that same entry via its row's Edit link, change the amount, confirm the dashboard
     reflects the new value.
  4. Delete it via its row's Delete button, confirm it disappears and the summary/breakdown
     figures drop back to what they were before step 2.

  Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/dashboard/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/dashboard/page.tsx
git commit -m "feat(app): add entry-point link from the dashboard" -m "A '+ Add entry' button in the dashboard header links to /entries/new, completing the add/edit/delete loop: add from the header, edit/delete from any ledger row." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Done — definition of complete

- `/entries/new` adds an entry (THB or a manual foreign-currency conversion) and redirects to
  `/dashboard` with the new totals visible.
- `/entries/[id]/edit` pre-fills an existing row, saves changes, and 404s for an unknown id.
- Every dashboard ledger row has working Edit and Delete affordances; delete updates the
  dashboard in place via `revalidatePath`.
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web`
  all pass.
- `entry-form.ts` and the new/changed `queries.ts` functions are unit-tested; Server Actions,
  `EntryForm`, and the routes are verified via `build:web` + manual `dev:web` walkthroughs,
  consistent with this repo's existing convention for Server/Client Components.

## Deferred (explicitly not in this slice)

Receipt scan / OCR import · recurring entries · bulk edit · category merge/alias tool (carried
from Slice 1) · auto FX lookup (carried from Slice 1) · a `source` column so the Monefy import
can stop truncating hand-entered rows (flagged as a pre-existing `ponytail` note in
`replaceEntries`; still not fixed) · polished inline validation UI (validation failures currently
throw and surface via Next's default error boundary).
