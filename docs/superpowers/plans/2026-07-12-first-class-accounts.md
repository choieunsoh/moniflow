# First-Class Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `entries.account` from a free-text column into a first-class `accounts` entity (id, name, icon, hue) with a managed `/accounts` page that shows a per-account spending breakdown/donut, mirroring how categories work.

**Architecture:** New `accounts` table + a text→id migration on `entries.account` (exact template of the existing `migrateCategoryIds`). Accounts diverge from categories in ONE way: the glyph is a bundled **payment-network brand mark** (icon *key* → inline SVG), not a free emoji. Everything account-local (icon/hue/add/resolve) lives in `features/accounts`; anything touching entries+accounts together (row join, counts, breakdown, rename/merge/delete) lives in `features/entries/queries.ts`, because the dependency arrow is **entries → accounts**, never back (identical to how categories work). Reuse `color.ts` (hue→color) and `merge-guard.ts` (`willMerge`) from `features/categories` — imported, NOT graduated to `shared/`.

**Tech Stack:** TypeScript 5.9 strict (ESM, extensionless imports, `@db`/`@features`/`@shared` aliases) · better-sqlite3 + drizzle-orm (query builder, no `as`) · Next.js 16 App Router (Server Components read SQLite directly; mutations via `'use server'` actions ending in `revalidatePath('/', 'layout')`) · React 19 · Tailwind v4 · ECharts 6 · Vitest + Testing Library.

**DEPENDS ON concern #2 (Toast + ConfirmDialog), which ships FIRST.** This plan treats `toast` / `toast.action` (from `@shared/ui/toast`) as an **already-existing primitive** — the account merge-and-remove flow fires an Undo toast. Do **not** implement the toast here. (The account merge dialog is its own native `<dialog>`; it does not use #2's `ConfirmDialog`, only its `toast.action`.)

**Project rules (enforced by lint/typecheck — do not violate):** no `any` / `as` / `!` / `@ts-*` comments · `type` over `interface` · `for..of` over `.forEach` · `Intl` formatting (no string date/number munging) · typed reads use the drizzle query builder so column selections infer the row type. Quality gates run **separately**: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. Format changed files with `npm run format:files <paths>` before committing. Every commit: `type(scope): subject` (scopes `db` / `features` / `app`), repeated `-m` for body paragraphs, split by topic, and END the body with these two trailers exactly:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8
```

**Design note — donut color (resolved deviation from the spec wording):** the existing `buildDonutOption` colors slices from a fixed `SLICE_COLORS` palette and ignores category hue; the category *list discs* use hue. Accounts reuse `buildDonutOption` **unchanged** (ring = `SLICE_COLORS`), and `hue` drives the per-account **list disc + chips**, exactly like categories. So "hue drives the donut" from the spec is realized as "hue drives the account disc; the ring keeps the shared palette" — no divergence from category behavior.

---

## Task 1: `accounts` schema + `ensureAccountsTable`

**Files:**
- Create: `src/features/accounts/schema.ts`
- Test: `src/features/accounts/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/schema.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureAccountsTable, accounts } from './schema';

describe('ensureAccountsTable', () => {
  it('creates an accounts table with an id PK, unique name, and defaults', () => {
    const db = initDb(':memory:');
    ensureAccountsTable(db);
    db.insert(accounts).values({ name: 'Cash', icon: 'cash' }).run();
    const rows = db.select().from(accounts).all();
    expect(rows).toEqual([
      { id: 1, name: 'Cash', icon: 'cash', hue: null, sortOrder: null, archived: 0 },
    ]);
    // name is UNIQUE — a duplicate insert throws
    expect(() => db.insert(accounts).values({ name: 'Cash', icon: 'card' }).run()).toThrow();
    // archived defaults to 0 via the raw bootstrap
    db.run(sql`INSERT INTO accounts (name, icon) VALUES ('Bank', 'card')`);
    const bank = db
      .select()
      .from(accounts)
      .where(sql`name = 'Bank'`)
      .get();
    expect(bank?.archived).toBe(0);
  });

  it('is idempotent — a second ensure keeps existing rows', () => {
    const db = initDb(':memory:');
    ensureAccountsTable(db);
    db.insert(accounts).values({ name: 'Cash', icon: 'cash' }).run();
    ensureAccountsTable(db);
    expect(db.select().from(accounts).all()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/accounts/schema.test.ts`
Expected: FAIL — cannot resolve `./schema` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/schema.ts` (mirrors `categories/schema.ts`; `icon` replaces `emoji`, and it wires the account migration so any read path that ensures accounts triggers the one-time backfill):

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { migrateAccountIds, dropLegacyAccountColumn } from '@db/migrate';
import type { Db } from '@db/client';

// First-class accounts. Each account is a real row with a surrogate `id` PK — entries reference it by
// `account_id`, so a rename touches one row and identity survives edits. `name` is the display string
// (UNIQUE). `icon` is an icon KEY (e.g. 'cash' | 'card' | 'visa' | 'mastercard' | 'jcb' | 'unionpay' |
// 'amex' | 'qr') resolved to a bundled brand SVG by AccountGlyph — NOT a free emoji char (the deliberate
// divergence from categories). `hue` (null = auto, name-derived) tints the account disc/chips. `sort_order`
// + `archived` ride along inert (parity with categories) for a later slice. This file is the schema
// source of truth; drizzle.config globs it.
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  icon: text('icon').notNull(),
  hue: integer('hue'),
  sortOrder: integer('sort_order'),
  archived: integer('archived').notNull().default(0),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap, matching the other features. The one-time backfill
// from the legacy text-keyed shape lives in migrateAccountIds (idempotent, guarded, no-op once done),
// invoked here and from ensureEntriesTable so any read path triggers it; dropLegacyAccountColumn then
// removes the legacy `entries.account` text column once account_id is populated.
export function ensureAccountsTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      hue INTEGER,
      sort_order INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
  migrateAccountIds(db);
  dropLegacyAccountColumn(db);
}
```

> This file imports `migrateAccountIds` / `dropLegacyAccountColumn` — they don't exist yet, so typecheck won't pass until Task 2. That's expected: the test only exercises `ensureAccountsTable`'s CREATE + drizzle table; run just this test file now, and run the gates after Task 2.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/accounts/schema.test.ts`
Expected: PASS (both cases). (Do not run `typecheck` yet — the `@db/migrate` exports land in Task 2.)

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/schema.ts src/features/accounts/schema.test.ts
git commit -m "feat(features): add first-class accounts table + ensureAccountsTable" -m "New accounts table mirrors categories (id, name unique, icon, hue, sort_order, archived) but stores an icon KEY instead of a free emoji. Wires migrateAccountIds/dropLegacyAccountColumn (added next) so any read path that ensures accounts triggers the one-time text->id backfill." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 2: `migrateAccountIds` + `dropLegacyAccountColumn`

**Files:**
- Modify: `src/db/migrate.ts` (append two functions)
- Test: `src/db/migrate.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing test**

Append to `src/db/migrate.test.ts` (after the existing `dropLegacyCategoryColumns` describe). Add the import at the top by changing the existing import line:

Change:
```typescript
import { migrateCategoryIds, dropLegacyCategoryColumns } from './migrate';
```
to:
```typescript
import {
  migrateCategoryIds,
  dropLegacyCategoryColumns,
  migrateAccountIds,
  dropLegacyAccountColumn,
} from './migrate';
```

Then append:

```typescript
// A DB in the pre-account-migration shape: entries keyed by account TEXT (category already migrated to
// category_id, since account migration ships after the category one). This is what a real user's data
// looks like just before the accounts upgrade.
function preAccountDb() {
  const db = initDb(':memory:');
  db.run(sql`CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, time TEXT, account TEXT NOT NULL,
    category_id INTEGER, amount REAL NOT NULL, currency TEXT, original_amount REAL, note TEXT,
    source TEXT NOT NULL DEFAULT 'manual')`);
  db.run(sql`INSERT INTO entries (date, account, category_id, amount) VALUES
    ('2026-07-01','Cash',1,-100), ('2026-07-02','Cash',1,-50), ('2026-07-03','Bank',2,-9000)`);
  return db;
}

describe('migrateAccountIds', () => {
  it('seeds one account row per distinct entries.account, defaulting icon to card', () => {
    const db = preAccountDb();
    migrateAccountIds(db);
    const rows = db.all(sql`SELECT name, icon, hue FROM accounts ORDER BY name`);
    expect(rows).toEqual([
      { name: 'Bank', icon: 'card', hue: null },
      { name: 'Cash', icon: 'card', hue: null },
    ]);
  });

  it('backfills entries.account_id by name with no nulls', () => {
    const db = preAccountDb();
    migrateAccountIds(db);
    const ok = db.all(sql`SELECT e.account_id = a.id AS ok FROM entries e
      JOIN accounts a ON a.name = e.account`);
    expect(ok.every((r) => typeof r === 'object' && r !== null && 'ok' in r && r.ok === 1)).toBe(true);
    const nulls = db.all(sql`SELECT id FROM entries WHERE account_id IS NULL`);
    expect(nulls).toHaveLength(0);
  });

  it('is idempotent — a second run does not duplicate accounts', () => {
    const db = preAccountDb();
    migrateAccountIds(db);
    const before = db.get(sql`SELECT count(*) AS n FROM accounts`);
    migrateAccountIds(db);
    const after = db.get(sql`SELECT count(*) AS n FROM accounts`);
    expect(after).toEqual(before);
  });

  it('is a no-op on a fresh install (no legacy account column) but still creates accounts', () => {
    const db = initDb(':memory:');
    migrateAccountIds(db);
    expect(() => db.run(sql`INSERT INTO accounts (name, icon) VALUES ('Cash','cash')`)).not.toThrow();
  });
});

describe('dropLegacyAccountColumn', () => {
  it('drops the vestigial account text column after backfill', () => {
    const db = preAccountDb();
    migrateAccountIds(db);
    dropLegacyAccountColumn(db);
    const cols = db
      .all(sql`PRAGMA table_info(entries)`)
      .flatMap((r) =>
        typeof r === 'object' && r !== null && 'name' in r && typeof r.name === 'string'
          ? [r.name]
          : [],
      );
    expect(cols).toContain('account_id');
    expect(cols).not.toContain('account');
  });

  it('is idempotent and safe on an already-clean DB', () => {
    const db = preAccountDb();
    migrateAccountIds(db);
    dropLegacyAccountColumn(db);
    expect(() => dropLegacyAccountColumn(db)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/migrate.test.ts`
Expected: FAIL — `migrateAccountIds`/`dropLegacyAccountColumn` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/db/migrate.ts` (reuses the existing module-level `tableColumns` helper):

```typescript
const FALLBACK_ICON = 'card'; // ponytail: default glyph for backfilled accounts; user re-icons on /accounts.

// Phase 1: create the accounts table, seed one row per distinct entries.account value, add + backfill
// account_id on entries. Does NOT drop the old text column — that is dropLegacyAccountColumn, run only
// after every consumer has moved. Guarded on column existence so it runs exactly once on a real DB and
// is cheap (a PRAGMA read) on every subsequent page load. Mirrors migrateCategoryIds.
export function migrateAccountIds(db: Db): void {
  db.run(sql`CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL,
    hue INTEGER,
    sort_order INTEGER,
    archived INTEGER NOT NULL DEFAULT 0
  )`);

  const entriesCols = tableColumns(db, 'entries');
  if (!entriesCols.includes('account')) return; // fresh install, or legacy text column already dropped
  if (entriesCols.includes('account_id')) return; // backfill already done (column not yet dropped)

  db.transaction((tx) => {
    tx.run(sql`INSERT OR IGNORE INTO accounts (name, icon)
      SELECT DISTINCT account, ${FALLBACK_ICON} FROM entries`);
    tx.run(sql`ALTER TABLE entries ADD COLUMN account_id INTEGER`);
    tx.run(sql`UPDATE entries SET account_id =
      (SELECT id FROM accounts WHERE accounts.name = entries.account)`);
  });
}

// Phase 2 (final task): drop the now-unused account text column. Idempotent — only drops it when its
// account_id replacement is present. SQLite >= 3.35 (bundled by better-sqlite3) supports DROP COLUMN.
export function dropLegacyAccountColumn(db: Db): void {
  const e = tableColumns(db, 'entries');
  if (e.includes('account') && e.includes('account_id')) {
    db.run(sql`ALTER TABLE entries DROP COLUMN account`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/db/migrate.test.ts`
Expected: PASS (all existing category cases + the new account cases).

Then verify Task 1 now typechecks against the new exports:
Run: `npm test -- src/features/accounts/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrate.ts src/db/migrate.test.ts
git commit -m "feat(db): add account text->id migration (migrateAccountIds + drop)" -m "Mirrors migrateCategoryIds: creates the accounts table, seeds one row per distinct entries.account (icon defaulted to 'card'), adds + backfills entries.account_id, and drops the legacy account text column in a separate idempotent phase. Guarded on column existence so it runs once and is cheap thereafter." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 3: Flip `entries` schema to `account_id` + trigger the migration

**Files:**
- Modify: `src/features/entries/schema.ts`

- [ ] **Step 1: Write the failing test**

No new test — this is a schema/bootstrap change verified by the migration test (Task 2) and the entries query test (Task 5). Skip straight to the edit, then rely on `npm test` at Step 4.

- [ ] **Step 2: (n/a — see Step 4 for verification)**

- [ ] **Step 3: Make the edits**

In `src/features/entries/schema.ts`:

(a) Change the import line 3 from:
```typescript
import { migrateCategoryIds, dropLegacyCategoryColumns } from '@db/migrate';
```
to:
```typescript
import {
  migrateCategoryIds,
  dropLegacyCategoryColumns,
  migrateAccountIds,
  dropLegacyAccountColumn,
} from '@db/migrate';
```

(b) In the `entries` table object, replace this line:
```typescript
  account: text('account').notNull(),
```
with:
```typescript
  accountId: integer('account_id'), // FK → accounts.id; app enforces non-null on write
```

(c) Update the `EntryRow` type — it must now carry BOTH joined names:
```typescript
// A read row for the UI: the stored entry plus the joined category + account NAMEs. Read queries
// project this so every display surface keeps working with names while storage uses ids.
export type EntryRow = Entry & { category: string; account: string };
```

(The `EntryInput` type already declares `account: string` (a name) — leave it exactly as-is; it is resolved to `account_id` at the query boundary, just like `category`.)

(d) In the raw `CREATE TABLE IF NOT EXISTS entries` inside `ensureEntriesTable`, replace this line:
```sql
      account TEXT NOT NULL,
```
with:
```sql
      account_id INTEGER,
```

(e) At the end of `ensureEntriesTable`, after the existing `migrateCategoryIds(db);` / `dropLegacyCategoryColumns(db);` calls, add the account migration:
```typescript
  migrateCategoryIds(db);
  dropLegacyCategoryColumns(db);
  migrateAccountIds(db);
  dropLegacyAccountColumn(db);
```

> Fresh installs now create `entries` with `account_id` directly (no `account` text ever); existing text-keyed DBs are upgraded by `migrateAccountIds`. Identical shape to how `category_id` was handled.

- [ ] **Step 4: Verify the build is still green where it can be**

Run: `npm test -- src/db/migrate.test.ts src/features/accounts/schema.test.ts`
Expected: PASS. (`npm run typecheck` will still FAIL until Task 5 updates `entries/queries.ts`, which references the removed `entries.account` column — that is the next task. Do not commit Task 3 alone; it is a partial edit. Proceed directly to Task 5, then commit Tasks 3+5 together at Task 5 Step 5.)

- [ ] **Step 5: (deferred — commit with Task 5)**

---

## Task 4: Account-local queries (icon / hue / add / resolve)

**Files:**
- Create: `src/features/accounts/queries.ts`
- Test: `src/features/accounts/queries.test.ts`

These are the reads/writes that touch ONLY the accounts table (no entries), so they live in `features/accounts` and import only `accounts/schema`. Mirrors the account-local half of `categories/queries.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/queries.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureAccountsTable } from './schema';
import {
  FALLBACK_ICON,
  addAccount,
  accountIdFor,
  listAccounts,
  getAccountIconMap,
  iconForAccount,
  setAccountIcon,
  getAccountHueMap,
  hueForAccount,
  setAccountHue,
} from './queries';

function db() {
  const d = initDb(':memory:');
  ensureAccountsTable(d);
  return d;
}

describe('accounts queries', () => {
  it('addAccount creates a row with the fallback icon and no-ops on a dup', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Cash');
    expect(listAccounts(d)).toEqual(['Cash']);
    expect(iconForAccount(getAccountIconMap(d), 'Cash')).toBe(FALLBACK_ICON);
  });

  it('accountIdFor resolves an existing name and creates a new one idempotently', () => {
    const d = db();
    const first = accountIdFor(d, 'Bank');
    const again = accountIdFor(d, 'Bank');
    expect(first).toBe(again);
    expect(listAccounts(d)).toEqual(['Bank']);
  });

  it('setAccountIcon upserts the icon key', () => {
    const d = db();
    addAccount(d, 'Wallet');
    setAccountIcon(d, 'Wallet', 'qr');
    expect(iconForAccount(getAccountIconMap(d), 'Wallet')).toBe('qr');
  });

  it('setAccountHue upserts hue and null resets to auto (undefined lookup)', () => {
    const d = db();
    addAccount(d, 'Visa');
    setAccountHue(d, 'Visa', 0); // 0 is a valid hue, must survive
    expect(hueForAccount(getAccountHueMap(d), 'Visa')).toBe(0);
    setAccountHue(d, 'Visa', null);
    expect(hueForAccount(getAccountHueMap(d), 'Visa')).toBeUndefined();
  });

  it('listAccounts is alphabetical', () => {
    const d = db();
    addAccount(d, 'Cash');
    addAccount(d, 'Bank');
    expect(listAccounts(d)).toEqual(['Bank', 'Cash']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/accounts/queries.test.ts`
Expected: FAIL — `./queries` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/queries.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { accounts } from './schema';

// Shown for any account without an assigned icon. 'card' is the neutral generic glyph.
export const FALLBACK_ICON = 'card';

// The closed glyph set the icon picker offers and AccountGlyph resolves. Keys only — the SVGs live in
// AccountGlyph. Kept here so the picker and the resolver share one source of truth.
export const ACCOUNT_ICONS = [
  'cash',
  'card',
  'visa',
  'mastercard',
  'jcb',
  'unionpay',
  'amex',
  'qr',
] as const;

export type AccountIcon = (typeof ACCOUNT_ICONS)[number];

export function getAccountIconMap(db: Db): Record<string, string> {
  const rows = db.select({ name: accounts.name, icon: accounts.icon }).from(accounts).all();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.name] = row.icon;
  return map;
}

export function iconForAccount(map: Record<string, string>, name: string): string {
  return map[name] ?? FALLBACK_ICON;
}

// Upsert: assigning an icon replaces any prior one. Creates the account row if the name is new.
export function setAccountIcon(db: Db, name: string, icon: string): void {
  db.insert(accounts)
    .values({ name, icon })
    .onConflictDoUpdate({ target: accounts.name, set: { icon } })
    .run();
}

// Only accounts with a picked hue land in the map; the rest fall through to the name-derived color.
export function getAccountHueMap(db: Db): Record<string, number> {
  const rows = db.select({ name: accounts.name, hue: accounts.hue }).from(accounts).all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.hue !== null) map[row.name] = row.hue;
  return map;
}

export function hueForAccount(map: Record<string, number>, name: string): number | undefined {
  return map[name];
}

// Upsert the hue. `null` resets to auto. A new name gets the fallback icon to satisfy NOT NULL; an
// existing row keeps its icon (only hue changes).
export function setAccountHue(db: Db, name: string, hue: number | null): void {
  db.insert(accounts)
    .values({ name, icon: FALLBACK_ICON, hue })
    .onConflictDoUpdate({ target: accounts.name, set: { hue } })
    .run();
}

// Create an empty account (no entries yet) with the fallback icon. No-op if the name already exists,
// so it never clobbers an existing account's icon/hue. Restyle with the picker afterwards.
export function addAccount(db: Db, name: string): void {
  db.insert(accounts)
    .values({ name, icon: FALLBACK_ICON })
    .onConflictDoNothing({ target: accounts.name })
    .run();
}

// All account names, alphabetical — the source of truth for "what accounts exist".
export function listAccounts(db: Db): string[] {
  return db
    .select({ name: accounts.name })
    .from(accounts)
    .orderBy(accounts.name)
    .all()
    .map((r) => r.name);
}

// Resolve an account name to its id, creating the row (fallback icon) if the name is new. The single
// write-boundary that turns the name-based UI/import into id-based storage. Idempotent.
export function accountIdFor(db: Db, name: string): number {
  db.insert(accounts)
    .values({ name, icon: FALLBACK_ICON })
    .onConflictDoNothing({ target: accounts.name })
    .run();
  const row = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, name)).get();
  if (!row) throw new Error(`accountIdFor: could not resolve account "${name}"`);
  return row.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/accounts/queries.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/queries.ts src/features/accounts/queries.test.ts
git commit -m "feat(features): account-local queries (icon/hue/add/resolve)" -m "Mirrors the account-local half of categories/queries: getAccountIconMap/iconForAccount/setAccountIcon, getAccountHueMap/hueForAccount/setAccountHue, addAccount, listAccounts, accountIdFor. Exports ACCOUNT_ICONS (the closed 8-key glyph set) as the shared source of truth for the picker and AccountGlyph. These touch only the accounts table (no entries), honoring the entries->accounts dependency arrow." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 5: Join accounts in `entries/queries.ts` (+ counts / breakdown / rename / merge / delete / undo)

**Files:**
- Modify: `src/features/entries/queries.ts`
- Test: `src/features/entries/queries.test.ts` (extend)

This is the big refactor: every entry read now joins `accounts` for the name; writes resolve `account_id`; and the account operations that touch entries live here (arrow: entries → accounts).

- [ ] **Step 1: Write the failing test**

Append to `src/features/entries/queries.test.ts` a new describe block. First ensure the imports at the top include what's used below (add any missing names to the existing import from `./queries` and add the accounts ensure import):

```typescript
import { ensureAccountsTable } from '@features/accounts/schema';
import {
  addEntries,
  getEntries,
  getDistinctAccounts,
  getAccountsByUsage,
  getLatestAccount,
  getAccountCounts,
  getAccountBreakdown,
  renameAccount,
  deleteAccount,
  mergeAccountInto,
  undoMergeAccount,
} from './queries';
```

Add the describe block:

```typescript
import { ensureEntriesTable } from './schema';
import { ensureCategoriesTable } from '@features/categories/schema';

function ledger() {
  const db = initDb(':memory:');
  ensureCategoriesTable(db);
  ensureAccountsTable(db);
  ensureEntriesTable(db);
  addEntries(db, [
    { date: '2026-07-01', account: 'Cash', category: 'food', amount: -100 },
    { date: '2026-07-02', account: 'Cash', category: 'food', amount: -50 },
    { date: '2026-07-03', account: 'Bank', category: 'rent', amount: -9000 },
  ]);
  return db;
}

describe('entries ↔ accounts', () => {
  it('getEntries projects the joined account name', () => {
    const db = ledger();
    const rows = getEntries(db);
    expect(rows.map((r) => r.account).sort()).toEqual(['Bank', 'Cash', 'Cash']);
  });

  it('getDistinctAccounts reads the accounts table (incl. accounts with no entries)', () => {
    const db = ledger();
    expect(getDistinctAccounts(db)).toEqual(['Bank', 'Cash']);
  });

  it('getAccountsByUsage orders by usage count', () => {
    const db = ledger();
    expect(getAccountsByUsage(db)).toEqual(['Cash', 'Bank']);
  });

  it('getLatestAccount returns the most recent entry account', () => {
    const db = ledger();
    expect(getLatestAccount(db)).toBe('Bank');
  });

  it('getAccountCounts left-joins so a zero-entry account still shows', () => {
    const db = ledger();
    addEntries(db, []); // no-op
    const counts = getAccountCounts(db);
    expect(counts.find((c) => c.account === 'Cash')?.count).toBe(2);
    expect(counts.find((c) => c.account === 'Bank')?.count).toBe(1);
  });

  it('getAccountBreakdown sums expenses per account, sorted by magnitude', () => {
    const db = ledger();
    const bd = getAccountBreakdown(db, '2026-07-01', '2026-07-31');
    expect(bd[0]).toMatchObject({ key: 'Bank', total: -9000, count: 1 });
    expect(bd[1]).toMatchObject({ key: 'Cash', total: -150, count: 2 });
  });

  it('renameAccount renames in place (same id, entries untouched)', () => {
    const db = ledger();
    renameAccount(db, 'Cash', 'Wallet');
    expect(getDistinctAccounts(db)).toEqual(['Bank', 'Wallet']);
    expect(getEntries(db).filter((r) => r.account === 'Wallet')).toHaveLength(2);
  });

  it('renameAccount MERGES when the target exists (reassigns then deletes source)', () => {
    const db = ledger();
    renameAccount(db, 'Cash', 'Bank');
    expect(getDistinctAccounts(db)).toEqual(['Bank']);
    expect(getEntries(db).every((r) => r.account === 'Bank')).toBe(true);
  });

  it('deleteAccount only removes an account with zero entries', () => {
    const db = ledger();
    deleteAccount(db, 'Cash'); // has entries → no-op
    expect(getDistinctAccounts(db)).toContain('Cash');
    addAccount(db, 'Empty');
    deleteAccount(db, 'Empty');
    expect(getDistinctAccounts(db)).not.toContain('Empty');
  });

  it('mergeAccountInto returns a snapshot and undoMergeAccount restores it', () => {
    const db = ledger();
    const snap = mergeAccountInto(db, 'Cash', 'Bank');
    expect(snap.source.name).toBe('Cash');
    expect(snap.movedIds).toHaveLength(2);
    expect(getDistinctAccounts(db)).toEqual(['Bank']);

    undoMergeAccount(db, snap);
    expect(getDistinctAccounts(db)).toEqual(['Bank', 'Cash']);
    expect(getEntries(db).filter((r) => r.account === 'Cash')).toHaveLength(2);
  });
});
```

> `addAccount` is used in the test — add it to the `@features/accounts/queries` import if not already imported, e.g. `import { addAccount } from '@features/accounts/queries';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — the new functions aren't exported / `entries.account` no longer exists.

- [ ] **Step 3: Write the implementation**

Edit `src/features/entries/queries.ts`:

(a) Update the import block at the top to add the accounts schema + resolver:
```typescript
import { accounts } from '@features/accounts/schema';
import { accountIdFor } from '@features/accounts/queries';
```

(b) Replace the `entryRowColumns` / `entryRowsQuery` / `toRow` / `toRows` block (the four definitions currently spanning the join projection and both write mappers) with:

```typescript
// Every read that returns entries for the UI projects this shape: the stored columns plus the joined
// category + account NAMEs. getTableColumns keeps it in lockstep with the schema. innerJoin because
// every entry has a category_id and an account_id after migration and on every write.
const entryRowColumns = {
  ...getTableColumns(entries),
  category: categories.name,
  account: accounts.name,
};

function entryRowsQuery(db: Db) {
  return db
    .select(entryRowColumns)
    .from(entries)
    .innerJoin(categories, eq(entries.categoryId, categories.id))
    .innerJoin(accounts, eq(entries.accountId, accounts.id));
}

// Resolve one write-input's category + account NAMEs to their ids (creating rows if new).
function toRow(db: Db, { category, account, ...rest }: EntryInput) {
  return { ...rest, categoryId: categoryIdFor(db, category), accountId: accountIdFor(db, account) };
}

// Bulk: resolve each DISTINCT category/account name once, then map every row through the cached lookup.
function toRows(db: Db, rows: EntryInput[]) {
  const catIds = new Map<string, number>();
  for (const name of new Set(rows.map((r) => r.category))) catIds.set(name, categoryIdFor(db, name));
  const acctIds = new Map<string, number>();
  for (const name of new Set(rows.map((r) => r.account))) acctIds.set(name, accountIdFor(db, name));
  return rows.map(({ category, account, ...rest }) => {
    const categoryId = catIds.get(category);
    const accountId = acctIds.get(account);
    if (categoryId === undefined) throw new Error(`toRows: unresolved category "${category}"`);
    if (accountId === undefined) throw new Error(`toRows: unresolved account "${account}"`);
    return { ...rest, categoryId, accountId };
  });
}
```

(c) Replace the existing `getDistinctAccounts` function (which read `entries.account`) with one that reads the accounts table (mirrors `getDistinctCategories`):

```typescript
export function getDistinctAccounts(db: Db): string[] {
  return db
    .select({ name: accounts.name })
    .from(accounts)
    .orderBy(accounts.name)
    .all()
    .map((r) => r.name);
}
```

(d) Replace `getAccountsByUsage` (joined + grouped by account id):

```typescript
// Accounts ordered by how often they've been used (most-used first). Drives the quick-entry account
// grid so the common accounts land at the front.
export function getAccountsByUsage(db: Db): string[] {
  return db
    .select({ account: accounts.name, count: sql<number>`count(${entries.id})` })
    .from(accounts)
    .leftJoin(entries, eq(entries.accountId, accounts.id))
    .groupBy(accounts.id)
    .all()
    .sort((a, b) => b.count - a.count)
    .map((r) => r.account);
}
```

(e) Replace `getLatestAccount` (join to read the name):

```typescript
// The account on the most recent entry — the quick-entry form's default. `undefined` when empty.
export function getLatestAccount(db: Db): string | undefined {
  return db
    .select({ account: accounts.name })
    .from(entries)
    .innerJoin(accounts, eq(entries.accountId, accounts.id))
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .limit(1)
    .get()?.account;
}
```

(f) In `searchEntries`, change the account match column. Replace:
```typescript
      and(lt(entries.amount, 0), or(has(entries.note), has(categories.name), has(entries.account))),
```
with:
```typescript
      and(lt(entries.amount, 0), or(has(entries.note), has(categories.name), has(accounts.name))),
```

(g) Append the account counts / breakdown / rename-merge / delete / merge-with-undo functions (mirrors `getCategoryCounts` / `getCategoryBreakdown` / `renameCategory` / `deleteCategory`). Note there are no per-account budgets, so the budget-settling logic from `renameCategory` is intentionally absent:

```typescript
export type AccountCount = { account: string; count: number };

// How many rows sit in each account, so the biggest are obvious before a rename/merge. leftJoin so an
// account with zero entries still shows (count 0). Grouped in SQL; sorted by count in JS (tiny result).
export function getAccountCounts(db: Db): AccountCount[] {
  return db
    .select({ account: accounts.name, count: sql<number>`count(${entries.id})` })
    .from(accounts)
    .leftJoin(entries, eq(entries.accountId, accounts.id))
    .groupBy(accounts.id)
    .all()
    .sort((a, b) => b.count - a.count);
}

// Per-account spending for a cycle (expenses only, magnitudes sorted desc) — feeds the /accounts donut
// + breakdown. Same shape/scope as getCategoryBreakdown.
export function getAccountBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return db
    .select({
      key: accounts.name,
      total: sql<number>`sum(${entries.amount})`,
      count: sql<number>`count(*)`,
    })
    .from(entries)
    .innerJoin(accounts, eq(entries.accountId, accounts.id))
    .where(and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0)))
    .groupBy(accounts.name)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// Rename an account by id, or MERGE when `to` already names a different account: reassign this
// account's entries to the target, then delete the now-empty source row. A pure rename keeps the same
// id (entries never rewritten; icon/hue follow the rename for free). No-op when `from` doesn't exist.
export function renameAccount(db: Db, from: string, to: string): void {
  const source = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, from)).get();
  if (!source) return;
  const target = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, to)).get();
  if (target && target.id !== source.id) {
    db.transaction((tx) => {
      tx.update(entries).set({ accountId: target.id }).where(eq(entries.accountId, source.id)).run();
      tx.delete(accounts).where(eq(accounts.id, source.id)).run();
    });
  } else {
    db.update(accounts).set({ name: to }).where(eq(accounts.id, source.id)).run();
  }
}

// Delete an account — but ONLY when it holds no entries (the ledger is lossless, so a used account is
// protected; use mergeAccountInto to remove a used one). No-op when the name doesn't exist.
export function deleteAccount(db: Db, name: string): void {
  const row = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, name)).get();
  if (!row) return;
  const used = db.select({ id: entries.id }).from(entries).where(eq(entries.accountId, row.id)).get();
  if (used) return;
  db.delete(accounts).where(eq(accounts.id, row.id)).run();
}

// A snapshot of a merge, enough to reverse it: the removed source account's display meta + exactly
// which entry ids were reassigned. Threaded to the client so the Undo toast can call undoMergeAccount.
export type AccountMergeSnapshot = {
  source: { name: string; icon: string; hue: number | null };
  targetName: string;
  movedIds: number[];
};

// Merge `from` INTO `to`, capturing an undo snapshot. Reassigns the source's entries to the target and
// deletes the source row. No-op-ish snapshot (empty movedIds) if either name is missing or equal.
export function mergeAccountInto(db: Db, from: string, to: string): AccountMergeSnapshot {
  const empty: AccountMergeSnapshot = {
    source: { name: from, icon: 'card', hue: null },
    targetName: to,
    movedIds: [],
  };
  if (from === to) return empty;
  const source = db
    .select({ id: accounts.id, name: accounts.name, icon: accounts.icon, hue: accounts.hue })
    .from(accounts)
    .where(eq(accounts.name, from))
    .get();
  const target = db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, to)).get();
  if (!source || !target) return empty;
  const moved = db
    .select({ id: entries.id })
    .from(entries)
    .where(eq(entries.accountId, source.id))
    .all()
    .map((r) => r.id);
  db.transaction((tx) => {
    tx.update(entries).set({ accountId: target.id }).where(eq(entries.accountId, source.id)).run();
    tx.delete(accounts).where(eq(accounts.id, source.id)).run();
  });
  return {
    source: { name: source.name, icon: source.icon, hue: source.hue },
    targetName: to,
    movedIds: moved,
  };
}

// Reverse a merge: recreate the source account with its old icon/hue, then move exactly the snapshot's
// entries back onto it. Idempotent-ish — if the source name was recreated meanwhile, onConflictDoNothing
// keeps its current row and the ids are still reassigned.
export function undoMergeAccount(db: Db, snap: AccountMergeSnapshot): void {
  if (snap.movedIds.length === 0) return;
  db.transaction((tx) => {
    tx.insert(accounts)
      .values({ name: snap.source.name, icon: snap.source.icon, hue: snap.source.hue })
      .onConflictDoNothing({ target: accounts.name })
      .run();
    const row = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.name, snap.source.name))
      .get();
    if (!row) throw new Error(`undoMergeAccount: could not recreate "${snap.source.name}"`);
    for (const id of snap.movedIds) {
      tx.update(entries).set({ accountId: row.id }).where(eq(entries.id, id)).run();
    }
  });
}
```

- [ ] **Step 4: Run tests + full gates**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS (existing + new `entries ↔ accounts` cases).

Now the whole build should typecheck (Tasks 3+5 complete the schema flip). Run all gates:
Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: all pass.

If `getForeignEntries` / other reads fail to typecheck, confirm they go through `entryRowsQuery` (they do) — the join is centralized, so they need no change.

- [ ] **Step 5: Commit (Tasks 3 + 5 together)**

```bash
npm run format:files src/features/entries/schema.ts src/features/entries/queries.ts src/features/entries/queries.test.ts
git add src/features/entries/schema.ts src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): store entries.account_id and join accounts for reads" -m "Flip entries.account (text) to account_id (FK), trigger migrateAccountIds/dropLegacyAccountColumn from ensureEntriesTable, and join the accounts table in entryRowsQuery so every EntryRow carries the account name. Writes resolve account_id via accountIdFor (single + bulk). getDistinctAccounts now reads the accounts table; getAccountsByUsage/getLatestAccount/searchEntries join it." -m "Adds the account operations that touch entries+accounts (so they live here, not in features/accounts): getAccountCounts, getAccountBreakdown, renameAccount (rename or merge), deleteAccount (zero-entry guard), and mergeAccountInto/undoMergeAccount (snapshot-based undo for the merge-and-remove flow)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 6: `AccountGlyph` — the 8 bundled brand SVGs

**Files:**
- Create: `src/features/accounts/ui/AccountGlyph.tsx`
- Test: `src/features/accounts/ui/AccountGlyph.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/ui/AccountGlyph.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AccountGlyph } from './AccountGlyph';
import { ACCOUNT_ICONS } from '../queries';

describe('AccountGlyph', () => {
  it('renders an <svg> for every icon key in the set', () => {
    for (const key of ACCOUNT_ICONS) {
      const { container } = render(<AccountGlyph icon={key} size={24} />);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('falls back to the card glyph for an unknown key', () => {
    const unknown = render(<AccountGlyph icon="not-a-real-key" size={24} />);
    const card = render(<AccountGlyph icon="card" size={24} />);
    expect(unknown.container.innerHTML).toBe(card.container.innerHTML);
  });

  it('applies the requested size to the svg', () => {
    const { container } = render(<AccountGlyph icon="visa" size={40} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('40');
    expect(svg?.getAttribute('height')).toBe('40');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/accounts/ui/AccountGlyph.test.tsx`
Expected: FAIL — `./AccountGlyph` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/ui/AccountGlyph.tsx`. Generics (`cash`, `card`, `qr`) use `currentColor` (inherit surrounding text); the five brands are full-color. Pure/presentational — renders in server or client components. Hand-authored simplified marks (fine for a private single-user app):

```tsx
import { FALLBACK_ICON } from '../queries';

// A payment-network glyph resolved from an icon KEY (the divergence from categories, which store a free
// emoji). Generics use currentColor; brand marks carry their own colors. Unknown keys fall back to the
// generic card. Pure/presentational — no hooks. `viewBox` is a 24-unit square for every glyph so `size`
// scales them uniformly.
type GlyphProps = { size: number };

function Cash({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 9v6M19 9v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Card({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2 9.5h20" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Qr({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M14 14h3v3M20 14v0M17 20h4M20 17v4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Visa({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="5" width="22" height="14" rx="2" fill="#1a1f71" />
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="700"
        fontStyle="italic"
        fontFamily="Arial, sans-serif"
        fill="#ffffff"
        letterSpacing="0.5"
      >
        VISA
      </text>
    </svg>
  );
}

function Mastercard({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="9.5" cy="12" r="6" fill="#eb001b" />
      <circle cx="14.5" cy="12" r="6" fill="#f79e1b" />
      <path d="M12 7.2a6 6 0 0 0 0 9.6 6 6 0 0 0 0-9.6Z" fill="#ff5f00" />
    </svg>
  );
}

function Jcb({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="5.5" height="12" rx="2" fill="#0e4c96" />
      <rect x="9.25" y="6" width="5.5" height="12" rx="2" fill="#d81e05" />
      <rect x="15.5" y="6" width="5.5" height="12" rx="2" fill="#00a05a" />
    </svg>
  );
}

function UnionPay({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="6" width="7" height="12" rx="2" fill="#e21836" />
      <rect x="8.5" y="6" width="7" height="12" rx="2" fill="#00447c" />
      <rect x="14" y="6" width="7" height="12" rx="2" fill="#007b84" />
    </svg>
  );
}

function Amex({ size }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="5" width="22" height="14" rx="2" fill="#2e77bc" />
      <text
        x="12"
        y="15"
        textAnchor="middle"
        fontSize="5.2"
        fontWeight="700"
        fontFamily="Arial, sans-serif"
        fill="#ffffff"
        letterSpacing="0.3"
      >
        AMEX
      </text>
    </svg>
  );
}

const GLYPHS: Record<string, (p: GlyphProps) => React.ReactElement> = {
  cash: Cash,
  card: Card,
  qr: Qr,
  visa: Visa,
  mastercard: Mastercard,
  jcb: Jcb,
  unionpay: UnionPay,
  amex: Amex,
};

export function AccountGlyph({ icon, size = 24 }: { icon: string; size?: number }) {
  const Glyph = GLYPHS[icon] ?? GLYPHS[FALLBACK_ICON];
  return <Glyph size={size} />;
}
```

> `React.ReactElement` needs React in scope: add `import type * as React from 'react';` at the top if the linter flags the `React` namespace (Next's JSX transform provides the runtime; the type import keeps strict TS happy without a value import).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/accounts/ui/AccountGlyph.test.tsx`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/accounts/ui/AccountGlyph.tsx src/features/accounts/ui/AccountGlyph.test.tsx
git add src/features/accounts/ui/AccountGlyph.tsx src/features/accounts/ui/AccountGlyph.test.tsx
git commit -m "feat(features): AccountGlyph — 8 bundled payment-network marks" -m "Resolves an icon key to an inline SVG: cash/card/qr as currentColor generics, visa/mastercard/jcb/unionpay/amex as full-color brand marks. Unknown keys fall back to the generic card. Zero dependencies — hand-inlined SVGs, matching how BottomBar inlines its icons. Pure/presentational so it renders in server or client components." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 7: `AccountIcon` — the glyph on a hue disc

**Files:**
- Create: `src/features/accounts/ui/AccountIcon.tsx`
- Test: `src/features/accounts/ui/AccountIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/ui/AccountIcon.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AccountIcon } from './AccountIcon';

describe('AccountIcon', () => {
  it('renders the glyph inside a colored disc', () => {
    const { container } = render(<AccountIcon icon="visa" name="Visa" size="md" />);
    const disc = container.firstElementChild;
    expect(disc).not.toBeNull();
    expect(disc?.querySelector('svg')).not.toBeNull();
    // hue disc uses an hsl(...) background from color.ts (name-derived when no hue given)
    expect((disc instanceof HTMLElement ? disc.style.background : '')).toContain('color-mix');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/accounts/ui/AccountIcon.test.tsx`
Expected: FAIL — `./AccountIcon` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/ui/AccountIcon.tsx`. Reuses `categoryColor` from `features/categories/color` (imported, not graduated). Brand marks are their own colors, so the disc is always the soft tint (never a bold white-on-hue disc like the phosphor/lucide category path):

```tsx
import { categoryColor } from '@features/categories/color';
import { AccountGlyph } from './AccountGlyph';

// An account marker: the payment-network glyph on a soft hue-tinted disc. `hue` (from the picker)
// overrides the name-derived color. Pure/presentational — no hooks — so it renders in server OR client
// components. Unlike CategoryIcon there is no bold white-icon variant: brand marks carry their own
// colors, so they always sit on the soft tint.
const SIZES = {
  sm: 'size-7',
  md: 'size-10',
  lg: 'size-14',
} as const;

const ICON_PX = { sm: 16, md: 22, lg: 28 } as const;

export function AccountIcon({
  icon,
  name,
  size = 'md',
  hue,
}: {
  icon: string;
  name: string;
  size?: keyof typeof SIZES;
  hue?: number;
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full ${SIZES[size]}`}
      style={{ background: `color-mix(in srgb, ${categoryColor(name, hue)} 22%, transparent)` }}
    >
      <AccountGlyph icon={icon} size={ICON_PX[size]} />
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/accounts/ui/AccountIcon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/accounts/ui/AccountIcon.tsx src/features/accounts/ui/AccountIcon.test.tsx
git add src/features/accounts/ui/AccountIcon.tsx src/features/accounts/ui/AccountIcon.test.tsx
git commit -m "feat(features): AccountIcon — glyph on a soft hue disc" -m "Mirrors CategoryIcon's emoji variant: AccountGlyph on a soft hue-tinted disc, hue-driven via categoryColor (imported from features/categories, not graduated to shared). No bold white-icon variant — brand marks carry their own colors, so they always sit on the soft tint." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 8: Account actions (`add` / `setIcon` / `setHue` / `merge` / `delete` / `merge-with-undo`)

**Files:**
- Create: `src/features/accounts/actions.ts`

Server Actions for the accounts feature. Each opens the DB, ensures tables, writes, and revalidates. `addAccountAction` / `setAccountIconAction` / `setAccountHueAction` / `mergeAccountAction` / `deleteAccountAction` are `FormData` actions (used by `<form action=>`). `mergeAndRemoveAccount` / `undoMergeAndRemoveAccount` are typed argument actions (called from the client merge dialog so it can thread the undo snapshot to the toast).

- [ ] **Step 1: Write the failing test**

Actions are thin wrappers over already-tested queries (Tasks 4 & 5) + Next mutation APIs that can't run under Vitest, so per the repo's convention (`entries/actions.ts` has no unit test) there is **no** action test. Verification is the typecheck gate + the page wiring in later tasks. Skip to Step 3.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureAccountsTable } from './schema';
import { addAccount, setAccountIcon, setAccountHue } from './queries';
import {
  renameAccount,
  deleteAccount,
  mergeAccountInto,
  undoMergeAccount,
  type AccountMergeSnapshot,
} from '@features/entries/queries';

// Create an empty account. Trimmed; blank is ignored. Duplicate names no-op in addAccount.
export async function addAccountAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name.trim()) return;
  const db = initDb();
  ensureAccountsTable(db);
  addAccount(db, name.trim());
  revalidatePath('/', 'layout');
}

// Assign an icon key to an account (upsert).
export async function setAccountIconAction(formData: FormData): Promise<void> {
  const account = formData.get('account');
  const icon = formData.get('icon');
  if (typeof account !== 'string' || typeof icon !== 'string' || !account || !icon) return;
  const db = initDb();
  ensureAccountsTable(db);
  setAccountIcon(db, account, icon);
  revalidatePath('/', 'layout');
}

// Set (or reset, via "auto") an account's disc hue.
export async function setAccountHueAction(formData: FormData): Promise<void> {
  const account = formData.get('account');
  const hueRaw = formData.get('hue');
  if (typeof account !== 'string' || !account || typeof hueRaw !== 'string') return;
  const hue = hueRaw === 'auto' ? null : Number(hueRaw);
  if (hue !== null && (!Number.isInteger(hue) || hue < 0 || hue > 359)) return;
  const db = initDb();
  ensureAccountsTable(db);
  setAccountHue(db, account, hue);
  revalidatePath('/', 'layout');
}

// Rename an account, or merge into an existing one when `to` already names a different account.
export async function mergeAccountAction(formData: FormData): Promise<void> {
  const from = formData.get('from');
  const to = formData.get('to');
  if (typeof from !== 'string' || typeof to !== 'string' || !from || !to.trim()) return;
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  renameAccount(db, from, to.trim());
  revalidatePath('/', 'layout');
}

// Delete an account. deleteAccount guards emptiness, so a used one is a no-op even if the UI submits it
// (the two-tap delete button is only shown at count 0).
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name) return;
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  deleteAccount(db, name);
  revalidatePath('/', 'layout');
}

// Merge-and-remove a USED account: reassign its entries into `to`, delete the source, and return the
// undo snapshot to the client so the Undo toast can reverse it. Typed args (not FormData) so the caller
// gets the snapshot back.
export async function mergeAndRemoveAccount(from: string, to: string): Promise<AccountMergeSnapshot> {
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  const snap = mergeAccountInto(db, from, to);
  revalidatePath('/', 'layout');
  return snap;
}

// Reverse a merge-and-remove from its snapshot (the Undo toast's action).
export async function undoMergeAndRemoveAccount(snap: AccountMergeSnapshot): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  undoMergeAccount(db, snap);
  revalidatePath('/', 'layout');
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/accounts/actions.ts
git add src/features/accounts/actions.ts
git commit -m "feat(features): account Server Actions (add/icon/hue/merge/delete/undo)" -m "FormData actions for add/setIcon/setHue/rename-merge/delete, plus typed-arg mergeAndRemoveAccount (returns the undo snapshot to the client) and undoMergeAndRemoveAccount for the merge-and-remove flow's Undo toast. Each ensures tables, writes via the tested queries, and revalidatePath('/', 'layout')." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 9: `AddAccount` + `AccountNameEditor` (add / rename-merge)

**Files:**
- Create: `src/features/accounts/ui/AddAccount.tsx`
- Create: `src/features/accounts/ui/AccountNameEditor.tsx`
- Test: `src/features/accounts/ui/AddAccount.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/ui/AddAccount.test.tsx` (mirrors the add-flow: disabled on blank/dup):

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddAccount } from './AddAccount';

describe('AddAccount', () => {
  it('disables Add for a blank or duplicate name and enables for a fresh one', async () => {
    render(<AddAccount names={['Cash']} />);
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled(); // blank
    const input = screen.getByLabelText('Add account');
    await userEvent.type(input, 'Cash');
    expect(add).toBeDisabled(); // duplicate
    expect(screen.getByText('already exists')).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, 'Bank');
    expect(add).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/accounts/ui/AddAccount.test.tsx`
Expected: FAIL — `./AddAccount` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/ui/AddAccount.tsx` (mirror of `AddCategory`):

```tsx
'use client';

import { useState } from 'react';
import { addAccountAction } from '../actions';

// Add a new empty account by name. The input is UNCONTROLLED, so React's form reset clears it after a
// successful submit and the action's FormData still reads the real DOM value; `draft` only mirrors the
// text to drive the disabled button + "already exists" hint. Blank and duplicate names are blocked here
// for instant feedback — addAccount also no-ops on a dup and `name` is UNIQUE. New accounts get the
// fallback icon; restyle with the per-row picker.
export function AddAccount({ names }: { names: string[] }) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const exists = names.includes(trimmed);
  const canAdd = trimmed !== '' && !exists;

  return (
    <form
      action={addAccountAction}
      onSubmit={(e) => {
        if (!canAdd) e.preventDefault();
        else setDraft('');
      }}
      className="flex w-full items-center gap-2"
    >
      <input
        name="name"
        onChange={(e) => setDraft(e.currentTarget.value)}
        placeholder="Add account…"
        aria-label="Add account"
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      />
      {exists && (
        <span className="shrink-0 text-xs" style={{ color: 'var(--color-muted)' }}>
          already exists
        </span>
      )}
      <button
        type="submit"
        disabled={!canAdd}
        className="btn btn-primary shrink-0 disabled:pointer-events-none disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
```

Create `src/features/accounts/ui/AccountNameEditor.tsx` (mirror of `CategoryNameEditor`, reusing `willMerge` from `features/categories/merge-guard`; the datalist id is `#account-options`):

```tsx
'use client';

import { useState } from 'react';
import { mergeAccountAction } from '../actions';
import { willMerge } from '@features/categories/merge-guard';

// Tap the account name to rename inline — or type an existing name to merge this account into that one
// (#account-options autocompletes). Saves on blur or Enter; a blur that's unchanged or empty collapses
// without submitting. Typing an EXISTING name folds this account into it (irreversible), so both save
// paths confirm first. The confirm is deferred a tick (a synchronous confirm() inside a blur steals
// focus and loops forever on cancel). Mirrors CategoryNameEditor.
export function AccountNameEditor({ account, onDone }: { account: string; onDone?: () => void }) {
  const [editing, setEditing] = useState(false);

  function attemptSubmit(input: HTMLInputElement) {
    const next = input.value.trim();
    if (!next || next === account) {
      setEditing(false);
      return;
    }
    const existing = Array.from(
      document.querySelectorAll<HTMLOptionElement>('#account-options option'),
      (o) => o.value,
    );
    if (willMerge(next, account, existing)) {
      setTimeout(() => {
        if (window.confirm(`Merge “${account}” into “${next}”? This can’t be undone.`)) {
          input.form?.requestSubmit();
        } else {
          setEditing(false);
        }
      }, 0);
      return;
    }
    input.form?.requestSubmit();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`Rename ${account}`}
        className="min-h-11 min-w-0 flex-1 truncate text-left font-medium"
      >
        {account}
      </button>
    );
  }

  return (
    <form
      action={mergeAccountAction}
      onSubmit={() => onDone?.()}
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      <input type="hidden" name="from" value={account} />
      <input
        name="to"
        list="account-options"
        defaultValue={account}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => attemptSubmit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            attemptSubmit(e.currentTarget);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            e.currentTarget.value = account;
            setEditing(false);
          }
        }}
        required
        aria-label={`Rename ${account}`}
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      />
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/accounts/ui/AddAccount.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/accounts/ui/AddAccount.tsx src/features/accounts/ui/AccountNameEditor.tsx src/features/accounts/ui/AddAccount.test.tsx
git add src/features/accounts/ui/AddAccount.tsx src/features/accounts/ui/AccountNameEditor.tsx src/features/accounts/ui/AddAccount.test.tsx
git commit -m "feat(features): AddAccount + AccountNameEditor (add/rename/merge)" -m "Mirror AddCategory + CategoryNameEditor: uncontrolled add-by-name with blank/dup guards, and inline rename that folds into an existing account (merge, window.confirm-gated) via #account-options autocomplete. Reuses willMerge from features/categories/merge-guard (imported, not graduated)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 10: `AccountIconPicker` — the icon + hue dialog

**Files:**
- Create: `src/features/accounts/ui/AccountIconPicker.tsx`

A per-account trigger (the account disc) that opens a native `<dialog>` with the 8 glyph tiles + the hue swatches. Mirrors `EmojiPicker` + `CategoryPickerDialog`, collapsed into one component since the account glyph set is a small fixed grid (no shared-across-page variant needed).

- [ ] **Step 1: Write the failing test**

This is a `<dialog>`-driven client component whose behavior (showModal, form submits to server actions) mirrors the already-covered `EmojiPicker`/`CategoryPickerDialog` and can't meaningfully run under jsdom without a `HTMLDialogElement.showModal` polyfill the repo doesn't use for those either. Per repo convention (no test for `EmojiPicker`/`CategoryPickerDialog`), there is **no** unit test here; verification is the typecheck gate + manual use on the page. Skip to Step 3.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/ui/AccountIconPicker.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import { AccountIcon } from './AccountIcon';
import { AccountGlyph } from './AccountGlyph';
import { AccountNameEditor } from './AccountNameEditor';
import { ACCOUNT_ICONS } from '../queries';
import { HUE_PRESETS, categoryColorBold } from '@features/categories/color';
import { setAccountIconAction, setAccountHueAction } from '../actions';

// Per-account icon + background picker as a native <dialog> (inherits focus-trap, Esc, ::backdrop from
// showModal). Tap the account disc to open. Each field is its own server-action form; picking submits and
// closes, and revalidation repaints every surface. Reuses the categories .emoji-dialog chrome/class and
// HUE_PRESETS/categoryColorBold (imported, not graduated). One instance per account row — the account
// list is short, so no shared-dialog provider is needed (unlike /records categories).
export function AccountIconPicker({
  account,
  current,
  hue,
}: {
  account: string;
  current: string;
  hue?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={`Choose icon for ${account}`}
        title={`Change icon for ${account}`}
        className="shrink-0 rounded-full transition-opacity active:opacity-70"
      >
        <AccountIcon icon={current} name={account} size="md" hue={hue} />
      </button>

      <dialog
        ref={ref}
        className="emoji-dialog"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <AccountIcon icon={current} name={account} size="lg" hue={hue} />
            <AccountNameEditor account={account} onDone={close} />
          </div>

          <h2 className="text-sm font-semibold">Icon</h2>
          <form action={setAccountIconAction} onSubmit={close} className="grid grid-cols-8 gap-1">
            <input type="hidden" name="account" value={account} />
            {ACCOUNT_ICONS.map((icon) => (
              <button
                key={icon}
                type="submit"
                name="icon"
                value={icon}
                aria-label={`Set ${icon}`}
                title={icon}
                className="grid aspect-square w-full place-items-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--color-surface-2)] active:opacity-70"
              >
                <AccountGlyph icon={icon} size={22} />
              </button>
            ))}
          </form>

          <h2 className="mt-1 text-sm font-semibold">Background</h2>
          <form action={setAccountHueAction} onSubmit={close} className="flex flex-wrap gap-2">
            <input type="hidden" name="account" value={account} />
            {HUE_PRESETS.map((preset) => {
              const selected = hue === preset.hue;
              return (
                <button
                  key={preset.hue}
                  type="submit"
                  name="hue"
                  value={preset.hue}
                  aria-label={preset.name}
                  aria-pressed={selected}
                  title={preset.name}
                  className={`size-8 rounded-full transition-transform active:opacity-70 ${
                    selected ? 'ring-2 ring-offset-2 ring-offset-[var(--color-surface)]' : ''
                  }`}
                  style={{ background: categoryColorBold(preset.name, preset.hue) }}
                />
              );
            })}
            <button
              type="submit"
              name="hue"
              value="auto"
              aria-label="Automatic color"
              aria-pressed={hue === undefined}
              title="Auto"
              className={`grid size-8 place-items-center rounded-full border text-[10px] font-medium transition-colors hover:bg-[var(--color-surface-2)] active:opacity-70 ${
                hue === undefined ? 'ring-2 ring-offset-2 ring-offset-[var(--color-surface)]' : ''
              }`}
              style={{ color: 'var(--color-muted)' }}
            >
              Auto
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/accounts/ui/AccountIconPicker.tsx
git add src/features/accounts/ui/AccountIconPicker.tsx
git commit -m "feat(features): AccountIconPicker — icon + hue dialog" -m "A per-account native <dialog> (tap the disc to open) with the 8-glyph icon grid + the HUE_PRESETS background swatches, each its own server-action form. Reuses the .emoji-dialog chrome and HUE_PRESETS/categoryColorBold from features/categories. One instance per row — the account list is short, so no shared-dialog provider is needed." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 11: `DeleteAccountButton` (empty) + `AccountMergeButton` (used → merge + Undo toast)

**Files:**
- Create: `src/features/accounts/ui/DeleteAccountButton.tsx`
- Create: `src/features/accounts/ui/AccountMergeButton.tsx`
- Test: `src/features/accounts/ui/DeleteAccountButton.test.tsx`

An account at count 0 gets the same two-tap arm-in-place delete as categories. A USED account (count > 0) can't be deleted (entries would orphan) — it gets a "merge & remove" button that opens a target picker, calls `mergeAndRemoveAccount`, and fires an Undo toast (concern #2's `toast.action`, already shipped).

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/ui/DeleteAccountButton.test.tsx` (mirror of the category two-tap test):

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteAccountButton } from './DeleteAccountButton';

describe('DeleteAccountButton', () => {
  it('arms on first tap (label changes to Delete) before committing', async () => {
    render(<DeleteAccountButton account="Empty" />);
    const btn = screen.getByRole('button', { name: 'Delete Empty' });
    await userEvent.click(btn);
    expect(screen.getByRole('button', { name: 'Confirm delete Empty' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/accounts/ui/DeleteAccountButton.test.tsx`
Expected: FAIL — `./DeleteAccountButton` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/accounts/ui/DeleteAccountButton.tsx` (mirror of `DeleteCategoryButton`):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteAccountAction } from '../actions';

// Two-tap arm-in-place delete for an unused (count 0) account — mobile-friendly, no modal. First tap
// arms (muted trash → red "Delete", auto-reverts after 3s); the second commits. ONE button that changes
// role so keyboard focus stays put and screen readers hear the label change. Mirrors DeleteCategoryButton.
export function DeleteAccountButton({ account }: { account: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function arm() {
    setArmed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), 3000);
  }

  return (
    <form action={deleteAccountAction} className="shrink-0">
      <input type="hidden" name="name" value={account} />
      <button
        type="button"
        onClick={armed ? (e) => e.currentTarget.form?.requestSubmit() : arm}
        aria-label={armed ? `Confirm delete ${account}` : `Delete ${account}`}
        className={
          armed
            ? 'tap rounded-[var(--radius-sm)] px-3 text-sm font-semibold transition-transform active:scale-95'
            : 'tap rounded-[var(--radius-sm)] px-2 transition-colors active:scale-95'
        }
        style={
          armed
            ? { background: 'var(--color-loss)', color: 'var(--color-on-accent)' }
            : { color: 'var(--color-faint)' }
        }
      >
        {armed ? 'Delete' : <Trash2 size={18} aria-hidden />}
      </button>
    </form>
  );
}
```

Create `src/features/accounts/ui/AccountMergeButton.tsx` (the used-account path: pick a target in a native `<dialog>`, call the typed action, fire the Undo toast):

```tsx
'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { mergeAndRemoveAccount, undoMergeAndRemoveAccount } from '../actions';
import { toast } from '@shared/ui/toast';

// A USED account can't be deleted (its entries would orphan) — instead "merge & remove": reassign its
// entries into a chosen target account, then drop the source. A native <dialog> (own chrome, its own
// <select>) picks the target; on confirm we call the typed action, get an undo snapshot back, and fire
// an Undo toast (toast.action, from concern #2). This is NOT the yes/no ConfirmDialog — it's a picker.
export function AccountMergeButton({ account, others }: { account: string; others: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState(others[0] ?? '');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!target || busy) return;
    setBusy(true);
    const snap = await mergeAndRemoveAccount(account, target);
    setBusy(false);
    ref.current?.close();
    toast.action(`Merged “${account}” into “${target}”`, {
      label: 'Undo',
      onClick: () => {
        void undoMergeAndRemoveAccount(snap);
      },
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={`Remove ${account}`}
        title={`Remove ${account} (merge its entries into another account)`}
        className="tap shrink-0 rounded-[var(--radius-sm)] px-2 transition-colors active:scale-95"
        style={{ color: 'var(--color-faint)' }}
      >
        <Trash2 size={18} aria-hidden />
      </button>

      <dialog
        ref={ref}
        className="emoji-dialog"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Remove “{account}”</h2>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            This account has entries. Move them into another account, then remove it. You can undo.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Move entries to
            <select
              value={target}
              onChange={(e) => setTarget(e.currentTarget.value)}
              className="min-h-11 rounded-[var(--radius-sm)] border px-3 text-base"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
            >
              {others.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="btn"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!target || busy}
              className="btn disabled:pointer-events-none disabled:opacity-40"
              style={{ background: 'var(--color-loss)', color: 'var(--color-on-accent)' }}
            >
              Merge &amp; remove
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- src/features/accounts/ui/DeleteAccountButton.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors (this confirms `@shared/ui/toast`'s `toast.action` signature — from concern #2 — matches; if concern #2 isn't merged yet, this task cannot compile, which is the intended ship order).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/accounts/ui/DeleteAccountButton.tsx src/features/accounts/ui/AccountMergeButton.tsx src/features/accounts/ui/DeleteAccountButton.test.tsx
git add src/features/accounts/ui/DeleteAccountButton.tsx src/features/accounts/ui/AccountMergeButton.tsx src/features/accounts/ui/DeleteAccountButton.test.tsx
git commit -m "feat(features): account delete (empty two-tap) + merge-and-remove (used)" -m "DeleteAccountButton mirrors the category two-tap arm-in-place delete for count-0 accounts. AccountMergeButton handles a USED account: a native <dialog> picks a target, calls mergeAndRemoveAccount, and fires an Undo toast (toast.action from concern #2) wired to undoMergeAndRemoveAccount. The picker is its own dialog, not the yes/no ConfirmDialog." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 12: DonutChart — parametrize the aria-label

**Files:**
- Modify: `src/features/entries/ui/DonutChart.tsx`

The `/accounts` donut reuses `DonutChart`, but its `aria-label` is hardcoded "Spending by category". Add an optional `label` prop.

- [ ] **Step 1–2: (trivial prop add — no separate test; covered by page render)**

- [ ] **Step 3: Make the edit**

In `src/features/entries/ui/DonutChart.tsx`:

Change the signature line:
```typescript
export function DonutChart({ rows }: { rows: Breakdown[] }) {
```
to:
```typescript
export function DonutChart({ rows, label = 'Spending by category' }: { rows: Breakdown[]; label?: string }) {
```

And change the `aria-label` on the returned `<div>`:
```tsx
      aria-label="Spending by category"
```
to:
```tsx
      aria-label={label}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test -- src/features/entries`
Expected: no errors; entries tests pass (the default keeps existing call sites working).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/ui/DonutChart.tsx
git add src/features/entries/ui/DonutChart.tsx
git commit -m "refactor(features): let DonutChart take an aria-label" -m "Add an optional `label` prop (default 'Spending by category') so the /accounts donut can announce 'Spending by account' while reusing the same chart wrapper + pure option-builder." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 13: The `/accounts` page (management + per-account donut/breakdown)

**Files:**
- Create: `src/app/accounts/page.tsx`

Mirrors `/categories` for management, and adds the cycle donut + ranked breakdown. Uses the cycle math the same way the home page does (reads the settings cutoff → current cycle range → `getAccountBreakdown`).

- [ ] **Step 1: Confirm the cycle helpers to reuse**

Read `src/app/page.tsx` and `src/features/entries/cycle.ts` to see exactly how the home page derives the current cycle range from the settings cutoff (functions like `getCutoffDay` / `cycleFromKey` / `currentCycleKey`). Use the SAME helpers here — do not reinvent cycle math. (This step is reading only; the code below assumes the home page's pattern: a cutoff-day read plus a `cycle` with `.start` / `.end`.)

- [ ] **Step 2: (no separate unit test — a server component that composes tested queries/components; verified by typecheck + `npm run build:web` + manual)**

- [ ] **Step 3: Write the page**

Create `src/app/accounts/page.tsx`. Adapt the cutoff/cycle derivation to match `src/app/page.tsx` exactly (the imports/among `@features/entries/cycle` and `@features/settings/queries` — mirror whatever the home page calls):

```tsx
// Reads the local SQLite DB per request — better-sqlite3 can't be prerendered, and the account list +
// breakdown must reflect the latest import/merge/icon.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getAccountCounts, getAccountBreakdown } from '@features/entries/queries';
import { ensureAccountsTable } from '@features/accounts/schema';
import { getAccountIconMap, iconForAccount, getAccountHueMap, hueForAccount } from '@features/accounts/queries';
import { AccountIconPicker } from '@features/accounts/ui/AccountIconPicker';
import { AccountNameEditor } from '@features/accounts/ui/AccountNameEditor';
import { AddAccount } from '@features/accounts/ui/AddAccount';
import { DeleteAccountButton } from '@features/accounts/ui/DeleteAccountButton';
import { AccountMergeButton } from '@features/accounts/ui/AccountMergeButton';
import { DonutChart } from '@features/entries/ui/DonutChart';
import { toBars } from '@features/entries/breakdown';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { PageContainer } from '@shared/ui/PageContainer';
import { todayIso } from '@shared/date';
import { formatBaht } from '@shared/money';

const countFmt = new Intl.NumberFormat('en-US');

export default function AccountsPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  ensureSettingsTable(db);

  const counts = getAccountCounts(db);
  const iconMap = getAccountIconMap(db);
  const hueMap = getAccountHueMap(db);

  // Current cycle range, derived exactly like the home page (getCutoff → currentCycleKey → cycleFromKey).
  const cutoff = getCutoff(db);
  const cycle = cycleFromKey(currentCycleKey(todayIso(), cutoff), cutoff);
  const breakdown = getAccountBreakdown(db, cycle.start, cycle.end);
  const bars = toBars(breakdown);
  const names = counts.map((c) => c.account);

  return (
    <PageContainer size="full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          This cycle&apos;s spending per account. Tap an icon to restyle it, the name to rename (type an
          existing name to merge). An unused account can be deleted; a used one can be merged &amp; removed.
        </p>
      </header>

      {breakdown.length > 0 && (
        <section className="panel flex flex-col gap-3 p-4">
          <DonutChart rows={breakdown} label="Spending by account" />
          <ul className="flex flex-col gap-2">
            {bars.map((b) => (
              <li key={b.key} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm">{b.key}</span>
                <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                  {formatBaht(Math.abs(b.total))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel overflow-hidden">
        {counts.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
            No accounts yet — add one below, or import some entries.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {counts.map((c) => (
              <li key={c.account} className="flex items-center gap-3 px-4 py-3">
                <AccountIconPicker
                  account={c.account}
                  current={iconForAccount(iconMap, c.account)}
                  hue={hueForAccount(hueMap, c.account)}
                />
                <AccountNameEditor account={c.account} />
                <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                  {countFmt.format(c.count)}
                </span>
                {c.count === 0 ? (
                  <DeleteAccountButton account={c.account} />
                ) : (
                  <AccountMergeButton account={c.account} others={names.filter((n) => n !== c.account)} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <datalist id="account-options">
        {counts.map((c) => (
          <option key={c.account} value={c.account} />
        ))}
      </datalist>

      {/* Sticky compose bar — mirrors the categories page. */}
      <div
        className="sticky mt-0"
        style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))', zIndex: 'var(--z-header)' }}
      >
        <div
          className="flex items-center rounded-[var(--radius-lg)] border p-2 backdrop-blur-md"
          style={{
            background: 'color-mix(in oklab, var(--color-surface-2) 92%, transparent)',
            borderColor: 'var(--color-border-strong)',
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <AddAccount names={names} />
        </div>
      </div>
    </PageContainer>
  );
}
```

> Import names are pinned against the real files: `getCutoff` (`@features/settings/queries`), `currentCycleKey(todayIso(), cutoff)` + `cycleFromKey(key, cutoff)` (`@features/entries/cycle`), `todayIso` (`@shared/date`), `formatBaht` (`@shared/money`) — exactly what `src/app/page.tsx` uses. Step 1's read is just to confirm nothing drifted since this plan was written.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm run build:web`
Expected: builds; `/accounts` compiles as a dynamic route.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/app/accounts/page.tsx
git add src/app/accounts/page.tsx
git commit -m "feat(app): /accounts page — manage accounts + per-account donut" -m "One surface that manages the account list (icon picker, rename/merge, add, delete/merge-and-remove) AND shows this cycle's spending per account: a reused DonutChart (labelled 'Spending by account') + a ranked breakdown list. Cycle range derived from the settings cutoff exactly like the home page. Home stays category-only." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 14: Add the Accounts tile to `MoreSheet`

**Files:**
- Modify: `src/shared/ui/MoreSheet.tsx`

- [ ] **Step 1–2: (nav change — verified by build + manual)**

- [ ] **Step 3: Make the edit**

In `src/shared/ui/MoreSheet.tsx`:

(a) Add `Wallet` to the lucide import:
```typescript
import { Tags, Plane, Settings } from 'lucide-react';
```
becomes:
```typescript
import { Tags, Wallet, Plane, Settings } from 'lucide-react';
```

(b) Add the Accounts entry to `LINKS` (first, next to Categories):
```typescript
const LINKS = [
  { href: '/categories', label: 'Categories', Icon: Tags },
  { href: '/accounts', label: 'Accounts', Icon: Wallet },
  { href: '/trips', label: 'Trips', Icon: Plane },
  { href: '/settings', label: 'Settings', Icon: Settings },
] as const;
```

> The grid is `grid-cols-3`, so four tiles wrap to a tidy 3 + 1 second row — acceptable. (If you'd rather a balanced 2×2, change `grid-cols-3` to `grid-cols-2` on the `<ul>`; either is fine. Leave as `grid-cols-3` unless it looks off in the browser.)

- [ ] **Step 4: Verify**

Run: `npm run build:web`
Expected: builds. Manually open the More sheet → an "Accounts" tile links to `/accounts`.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/shared/ui/MoreSheet.tsx
git add src/shared/ui/MoreSheet.tsx
git commit -m "feat(shared): add Accounts tile to the More sheet" -m "Wire /accounts into the overflow nav with a lucide Wallet icon, next to Categories. The grid-cols-3 tile grid wraps the fourth tile to a second row." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 15: Swap the EntryForm account field to a managed `<select>`

**Files:**
- Modify: `src/features/entries/ui/EntryForm.tsx`

Kill the free-text datalist (the 'Cash' vs 'cash' dup class) by picking from the managed account list. A `<select>` is the clean-list control; new accounts are created on `/accounts`, not inline here.

- [ ] **Step 1–2: (form control swap — verified by build + manual; the Keypad already constrains accounts to a fixed chip list, so only EntryForm allowed free text)**

- [ ] **Step 3: Make the edit**

In `src/features/entries/ui/EntryForm.tsx`:

(a) Remove the now-unused `accountListId` (the `<select>` needs no datalist). Delete this line:
```typescript
  const accountListId = useId();
```
(Leave `categoryListId` — the category field still uses a datalist.)

(b) Replace the entire Account `<label>` block:
```tsx
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
```
with a `<select>`:
```tsx
        <label className="flex flex-col gap-1 text-sm">
          Account
          <select
            name="account"
            defaultValue={entry?.account ?? accounts[0] ?? ''}
            required
            className={fieldClass}
            style={fieldStyle}
          >
            {accounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
```

> `useId` may now be imported but only used for `categoryListId` — that's still one use, so the import stays. If lint flags `useId` as unused, it means both were removed; keep it for `categoryListId`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint`
Expected: no errors.
Run: `npm run build:web`
Expected: builds. Manually: the edit form's Account field is now a dropdown of managed accounts, pre-selecting the entry's current account.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/ui/EntryForm.tsx
git add src/features/entries/ui/EntryForm.tsx
git commit -m "feat(features): pick the entry account from the managed list" -m "Swap EntryForm's free-text account datalist for a <select> over the managed accounts, killing the 'Cash' vs 'cash' duplicate class. New accounts are created on /accounts, not inline. The Keypad already constrained accounts to a fixed chip list, so no change there." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Task 16: Full-suite green + final verification

**Files:** none (verification only).

- [ ] **Step 1: Run every gate separately**

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```
Expected: all pass. If `format:check` flags anything, run `npm run format:files <file>` on it and amend the relevant commit.

- [ ] **Step 2: Build the web app**

```bash
npm run build:web
```
Expected: production build succeeds; `/accounts` is listed as a dynamic route.

- [ ] **Step 3: Manual smoke (dev server)**

```bash
npm run dev:web
```
Then in the browser (127.0.0.1:4010):
- Open **More → Accounts**. Confirm existing accounts appear with the generic card glyph and their entry counts.
- Tap an account's disc → pick **Visa** and a **hue** → the disc updates (brand mark on the tint).
- Tap a name → rename it; type an existing account name → the merge confirm fires.
- On a **count-0** account → two-tap **Delete** removes it.
- On a **used** account → **merge & remove** → pick a target → confirm → an **Undo** toast appears; click **Undo** → the account returns with its entries.
- Add an account via the sticky bar.
- Open **Add/Edit entry** → the **Account** field is a dropdown of managed accounts.
- Confirm the home page donut is still **by category** (unchanged).

- [ ] **Step 4: (nothing to commit — all work landed in Tasks 1–15)**

---

## Notes for the implementer

- **Ship order:** concern #2 (Toast + ConfirmDialog) must be merged first. Task 11 imports `@shared/ui/toast`; it will not compile without it.
- **No new npm dependencies.** All glyphs are inline SVG. `lucide-react` is already a dependency (used by MoreSheet / DeleteCategoryButton).
- **Dependency arrow:** `features/accounts` never imports `features/entries`. Everything that reads/writes entries + accounts together lives in `features/entries/queries.ts`. Reused `color.ts` / `merge-guard.ts` come from `features/categories` (imported, not graduated).
- **Out of scope (do not build):** per-account budgets, account types/currencies, balance tracking, reorder UI. `sort_order` / `archived` ship inert.
