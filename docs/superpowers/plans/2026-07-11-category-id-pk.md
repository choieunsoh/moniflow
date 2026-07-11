# Category `id` PK Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give categories a surrogate `id` primary key and make `entries` / `budgets` reference categories by that id, so a rename touches one row, identity is stable, and a category can exist with zero entries.

**Architecture:** A new `categories` table (replacing `category_meta`) owns `id` + `name` (unique) + `emoji` + `hue` + `sort_order` + `archived`. `entries.category_id` and `budgets.category_id` are integer FKs. **Storage uses ids; read queries `JOIN categories` and keep projecting the category *name*, so the entire UI and the pure display/model modules (`donut`, `by-category`, `budget-status`) are untouched.** Category name → id resolution happens only at the DB write boundary via `categoryIdFor`. The one-time data migration is **two-phase**: phase 1 (`migrateCategoryIds`) creates + backfills without dropping anything, so every intermediate commit compiles and passes; phase 2 (`dropLegacyCategoryColumns`, last task) removes the vestigial text columns and `category_meta`. Both are idempotent, guarded on column existence, and fold into the existing `ensure*Table` bootstrap path — no migration runner is introduced.

**Tech Stack:** TypeScript 5.9 (strict, ESM, extensionless relative imports) · better-sqlite3 + drizzle-orm (query builder, no relational API) · drizzle raw `sql` for the migration · Vitest. Global TS bans apply: no `any` / `as` / `!` / ts-comments; `type` over `interface`; `for..of`; `Intl` formatting.

**Key architectural notes for the implementer:**

- **`Db`** is `drizzle-orm/better-sqlite3`'s `BetterSQLite3Database` (see `src/db/client.ts`). It exposes `db.select()/insert()/update()/delete()`, `db.transaction((tx) => …)`, and raw `db.run(sql\`…\`)` / `db.all(sql\`…\`)`. Tests build one with `initDb(':memory:')`.
- **Cross-feature imports are allowed here** and follow existing precedent (`entries/actions.ts` already imports from `@features/categories`). Specifically: `entries/queries.ts` may import the `categories` table + `categoryIdFor` from the categories feature, and the `budgets` table from the budgets feature. There is **no** import cycle because `categories/queries.ts` and the three `schema.ts` files never import `entries`. Do not add a back-edge from categories → entries.
- **`category_id` is nullable at the DB level** — SQLite can't `ALTER` a column to `NOT NULL` without a full table rebuild. App writes always set it. `// ponytail: category_id nullable at DB level, app enforces non-null on every write; table-rebuild to hard NOT NULL only if drift shows up.`
- The migration **leaves the old `category` text columns in place** through the whole plan until the final task. Drizzle only touches columns its table object declares, so a leftover nullable `category` column is inert.

---

## File Structure

**Create:**
- `src/db/migrate.ts` — `migrateCategoryIds(db)` (phase 1 backfill) + `dropLegacyCategoryColumns(db)` (phase 2) + a private `tableColumns` PRAGMA helper. Raw SQL only; imports nothing from features (respects the features → db arrow).
- `src/db/migrate.test.ts` — migration tests over a hand-built legacy-shape DB.

**Modify:**
- `src/features/categories/schema.ts` — replace `categoryMeta` table with `categories`; `ensureCategoryMetaTable` → `ensureCategoriesTable` (calls `migrateCategoryIds`).
- `src/features/categories/queries.ts` — `getEmojiMap`/`getHueMap`/`setCategoryEmoji`/`setCategoryHue` read/write `categories`; add `categoryIdFor`; delete `renameCategoryMeta`.
- `src/features/categories/actions.ts` — swap `ensureCategoryMetaTable` → `ensureCategoriesTable`.
- `src/features/entries/schema.ts` — `category` text → `categoryId` integer; add `EntryInput` + `EntryRow` types; `ensureEntriesTable` calls `migrateCategoryIds`.
- `src/features/entries/queries.ts` — reads join `categories` for the name; writes resolve name→id; `renameCategory` becomes id-aware rename+merge; counts/distinct/search re-pointed.
- `src/features/entries/entry-form.ts` — annotate result as `EntryInput` (body unchanged).
- `src/features/entries/seed.ts` — annotate `DEMO` as `EntryInput[]` (body unchanged).
- `src/features/entries/actions.ts` — `mergeCategoryAction` drops the `renameCategoryMeta` call; ensure calls updated.
- `src/features/entries/import.ts` — `parseMonefyCsv` return type → `EntryInput[]` (body unchanged).
- `src/features/budgets/schema.ts` — `category` text → `categoryId` integer; `ensureBudgetsTable` calls `migrateCategoryIds`.
- `src/features/budgets/queries.ts` — `getBudgets` joins for name; `setBudget`/`deleteBudget` resolve name→id.
- App pages that call `ensureCategoryMetaTable` — rename the import to `ensureCategoriesTable` (`src/app/page.tsx`, `src/app/records/page.tsx`, `src/app/categories/page.tsx`, `src/app/budgets/page.tsx`, `src/app/entries/new/page.tsx`).
- Test files for each modified query/schema module.

**Untouched by design:** all `src/features/**/ui/*.tsx`, `donut.ts`, `by-category.ts`, `budget-status.ts`, `merge-guard.ts`, `merge-input.ts`, `parseEntryForm`/`parseCsv`/`parseMonefyCsv` bodies, and their tests — because the read queries keep returning category **names** and the emoji/hue maps keep their `{ name → value }` shape.

---

## Task 1: `categories` schema + `ensureCategoriesTable`

**Files:**
- Modify: `src/features/categories/schema.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/features/categories/schema.test.ts` (create the file if it doesn't exist — mirror `settings/schema.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureCategoriesTable, categories } from './schema';

describe('ensureCategoriesTable', () => {
  it('creates an empty categories table with an id PK and unique name', () => {
    const db = initDb(':memory:');
    ensureCategoriesTable(db);
    db.insert(categories).values({ name: 'groceries', emoji: '🛒' }).run();
    const rows = db.select().from(categories).all();
    expect(rows).toEqual([
      { id: 1, name: 'groceries', emoji: '🛒', hue: null, sortOrder: null, archived: 0 },
    ]);
    // name is UNIQUE — a duplicate insert throws
    expect(() => db.insert(categories).values({ name: 'groceries', emoji: '🍔' }).run()).toThrow();
    // archived defaults to 0 via the raw bootstrap
    db.run(sql`INSERT INTO categories (name, emoji) VALUES ('rent', '🏠')`);
    const rent = db.select().from(categories).where(sql`name = 'rent'`).get();
    expect(rent?.archived).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/categories/schema.test.ts`
Expected: FAIL — `ensureCategoriesTable` / `categories` not exported.

- [ ] **Step 3: Replace the schema**

Replace the entire body of `src/features/categories/schema.ts` with:

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { migrateCategoryIds } from '@db/migrate';
import type { Db } from '@db/client';

// First-class categories. Each category is a real row with a surrogate `id` PK — entries and budgets
// reference it by `category_id`, so a rename touches one row and identity survives edits. `name` is
// the display string (UNIQUE — two categories can't share a name). `emoji`/`hue` are the display meta
// that used to live in `category_meta` (hue null = auto, name-derived color). `sort_order` + `archived`
// back a category-management UI (manual order, hide-without-delete) that is a later slice — the columns
// ship now, inert until that UI lands. This file is the schema source of truth; drizzle.config globs it.
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  emoji: text('emoji').notNull(),
  hue: integer('hue'),
  sortOrder: integer('sort_order'),
  archived: integer('archived').notNull().default(0),
});

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap, matching the other features. The one-time backfill
// from the legacy text-keyed shape lives in migrateCategoryIds (idempotent, guarded, no-op once done),
// invoked here and from ensureEntriesTable/ensureBudgetsTable so any read path triggers it.
export function ensureCategoriesTable(db: Db): void {
  migrateCategoryIds(db);
}
```

> Note: `migrateCategoryIds` (Task 2) does the `CREATE TABLE IF NOT EXISTS categories (…)` itself, so `ensureCategoriesTable` just delegates. This keeps the create statement in exactly one place.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/categories/schema.test.ts`
Expected: PASS. (Task 2 provides `migrateCategoryIds`; do Task 2 before running if the import fails to resolve — or stub it as `export function migrateCategoryIds() {}` temporarily. Recommended: implement Task 2 first, then Task 1. If working strictly top-down, create the stub now and the real body in Task 2.)

- [ ] **Step 5: Commit**

```bash
git add src/features/categories/schema.ts src/features/categories/schema.test.ts
git commit -m "feat(features): categories table with id PK, replacing category_meta" -m "Categories become first-class rows: id PK, unique name, emoji/hue display meta (moved off category_meta), plus inert sort_order/archived columns for a later management UI."
```

---

## Task 2: `migrateCategoryIds` phase-1 backfill (+ `dropLegacyCategoryColumns` scaffold)

**Files:**
- Create: `src/db/migrate.ts`
- Create: `src/db/migrate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/db/migrate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { migrateCategoryIds } from './migrate';

// Build a DB in the pre-migration ("legacy") shape: entries/budgets keyed by category TEXT, plus a
// category_meta table carrying emoji/hue. This is what a real user's data looks like before upgrade.
function legacyDb() {
  const db = initDb(':memory:');
  db.run(sql`CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, time TEXT, account TEXT NOT NULL,
    category TEXT NOT NULL, amount REAL NOT NULL, currency TEXT, original_amount REAL, note TEXT,
    source TEXT NOT NULL DEFAULT 'manual')`);
  db.run(sql`CREATE TABLE budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, amount REAL NOT NULL)`);
  db.run(sql`CREATE TABLE category_meta (category TEXT PRIMARY KEY, emoji TEXT NOT NULL, hue INTEGER)`);
  db.run(sql`INSERT INTO entries (date, account, category, amount) VALUES
    ('2026-07-01','cash','groceries',-100), ('2026-07-02','cash','groceries',-50),
    ('2026-07-03','bank','rent',-9000)`);
  db.run(sql`INSERT INTO category_meta (category, emoji, hue) VALUES ('groceries','🛒',120)`);
  db.run(sql`INSERT INTO budgets (category, amount) VALUES ('groceries', 3000), (NULL, 20000)`);
  return db;
}

describe('migrateCategoryIds', () => {
  it('seeds categories from entries ∪ category_meta, carrying meta emoji/hue', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const cats = db.all(sql`SELECT name, emoji, hue FROM categories ORDER BY name`);
    expect(cats).toEqual([
      { name: 'groceries', emoji: '🛒', hue: 120 },
      { name: 'rent', emoji: '🏷️', hue: null }, // no meta row → fallback emoji
    ]);
  });

  it('backfills entries.category_id by name', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const rows = db.all(sql`SELECT e.category_id = c.id AS ok FROM entries e
      JOIN categories c ON c.name = e.category`);
    expect(rows.every((r) => typeof r === 'object' && r !== null && 'ok' in r && r.ok === 1)).toBe(true);
    const nulls = db.all(sql`SELECT id FROM entries WHERE category_id IS NULL`);
    expect(nulls).toHaveLength(0);
  });

  it('backfills budgets.category_id and keeps the total (NULL) row NULL', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const perCat = db.get(sql`SELECT category_id FROM budgets WHERE category = 'groceries'`);
    const total = db.get(sql`SELECT category_id FROM budgets WHERE category IS NULL`);
    expect(perCat).toMatchObject({ category_id: expect.any(Number) });
    expect(total).toMatchObject({ category_id: null });
  });

  it('is idempotent — a second run changes nothing and does not duplicate categories', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const before = db.get(sql`SELECT count(*) AS n FROM categories`);
    migrateCategoryIds(db);
    const after = db.get(sql`SELECT count(*) AS n FROM categories`);
    expect(after).toEqual(before);
  });

  it('is a no-op on a fresh install (no legacy entries table) but still creates categories', () => {
    const db = initDb(':memory:');
    migrateCategoryIds(db);
    expect(() => db.run(sql`INSERT INTO categories (name, emoji) VALUES ('x','🏷️')`)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/migrate.test.ts`
Expected: FAIL — `./migrate` has no `migrateCategoryIds`.

- [ ] **Step 3: Implement the migration**

Create `src/db/migrate.ts`:

```ts
import { sql } from 'drizzle-orm';
import type { Db } from './client';

// One-time, idempotent migration from the legacy text-keyed category model to the surrogate-id model.
// Raw SQL by design: it references tables from several features by name, so keeping it out of the
// drizzle table objects avoids coupling db/ to any feature (the features → db arrow stays intact) and
// sidesteps the chicken-and-egg of schemas that are mid-flip. Guarded on column existence so it runs
// exactly once on a real DB and is cheap (two PRAGMA reads) on every subsequent page load.

function tableColumns(db: Db, table: string): string[] {
  const rows = db.all(sql`PRAGMA table_info(${sql.raw(table)})`);
  const names: string[] = [];
  for (const r of rows) {
    if (typeof r === 'object' && r !== null && 'name' in r && typeof r.name === 'string') {
      names.push(r.name);
    }
  }
  return names;
}

const FALLBACK_EMOJI = '🏷️'; // ponytail: duplicated from categories/queries to keep db/ feature-free.

// Phase 1: create the categories table, seed it, add + backfill category_id on entries and budgets.
// Does NOT drop the old text columns — that is dropLegacyCategoryColumns, run only after every consumer
// has moved (final task). Leaving them keeps intermediate states valid: drizzle ignores columns its
// table object doesn't declare.
export function migrateCategoryIds(db: Db): void {
  db.run(sql`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL,
    hue INTEGER,
    sort_order INTEGER,
    archived INTEGER NOT NULL DEFAULT 0
  )`);

  const entriesCols = tableColumns(db, 'entries');
  if (!entriesCols.includes('category')) return; // fresh install, or legacy text column already dropped
  if (entriesCols.includes('category_id')) return; // backfill already done (columns not yet dropped)

  db.transaction((tx) => {
    // Seed from category_meta first (carries emoji/hue), then any names only present on entries.
    if (tableColumns(db, 'category_meta').length > 0) {
      tx.run(sql`INSERT OR IGNORE INTO categories (name, emoji, hue)
        SELECT category, emoji, hue FROM category_meta`);
    }
    tx.run(sql`INSERT OR IGNORE INTO categories (name, emoji)
      SELECT DISTINCT category, ${FALLBACK_EMOJI} FROM entries`);

    tx.run(sql`ALTER TABLE entries ADD COLUMN category_id INTEGER`);
    tx.run(sql`UPDATE entries SET category_id =
      (SELECT id FROM categories WHERE categories.name = entries.category)`);

    const budgetsCols = tableColumns(db, 'budgets');
    if (budgetsCols.includes('category') && !budgetsCols.includes('category_id')) {
      tx.run(sql`ALTER TABLE budgets ADD COLUMN category_id INTEGER`);
      tx.run(sql`UPDATE budgets SET category_id =
        (SELECT id FROM categories WHERE categories.name = budgets.category)
        WHERE budgets.category IS NOT NULL`);
    }
  });
}

// Phase 2 (final task): drop the now-unused text columns and the category_meta table. Idempotent —
// only drops what still exists alongside its category_id replacement. SQLite ≥ 3.35 (bundled by
// better-sqlite3) supports ALTER TABLE ... DROP COLUMN.
export function dropLegacyCategoryColumns(db: Db): void {
  const e = tableColumns(db, 'entries');
  if (e.includes('category') && e.includes('category_id')) {
    db.run(sql`ALTER TABLE entries DROP COLUMN category`);
  }
  const b = tableColumns(db, 'budgets');
  if (b.includes('category') && b.includes('category_id')) {
    db.run(sql`ALTER TABLE budgets DROP COLUMN category`);
  }
  db.run(sql`DROP TABLE IF EXISTS category_meta`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/db/migrate.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add src/db/migrate.ts src/db/migrate.test.ts
git commit -m "feat(db): idempotent migration from text-keyed to id-keyed categories" -m "migrateCategoryIds seeds the categories table from entries + category_meta and backfills category_id on entries/budgets without dropping legacy columns, so intermediate states stay valid. dropLegacyCategoryColumns removes them in the final task."
```

---

## Task 3: `categoryIdFor` + port emoji/hue queries onto `categories`

**Files:**
- Modify: `src/features/categories/queries.ts`
- Modify: `src/features/categories/queries.test.ts`

- [ ] **Step 1: Write the failing test**

Replace the emoji/hue/rename tests in `src/features/categories/queries.test.ts` (keep the `EMOJI_CHOICES`/`EMOJI_LABELS` tests as-is). Use `ensureCategoriesTable` for setup:

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureCategoriesTable } from './schema';
import {
  getEmojiMap, setCategoryEmoji, emojiFor, FALLBACK_EMOJI,
  getHueMap, setCategoryHue, hueFor, categoryIdFor,
} from './queries';

function db() {
  const d = initDb(':memory:');
  ensureCategoriesTable(d);
  return d;
}

describe('categoryIdFor', () => {
  it('inserts a new category with the fallback emoji and returns its id', () => {
    const d = db();
    const id = categoryIdFor(d, 'groceries');
    expect(id).toBeGreaterThan(0);
    expect(getEmojiMap(d)).toEqual({ groceries: FALLBACK_EMOJI });
  });

  it('returns the existing id for a known name and does not duplicate or overwrite meta', () => {
    const d = db();
    setCategoryEmoji(d, 'groceries', '🛒');
    const first = categoryIdFor(d, 'groceries');
    const second = categoryIdFor(d, 'groceries');
    expect(second).toBe(first);
    expect(getEmojiMap(d)).toEqual({ groceries: '🛒' }); // emoji preserved, not reset to fallback
  });
});

describe('emoji + hue maps read/write categories', () => {
  it('upserts an emoji and reads it back keyed by name', () => {
    const d = db();
    setCategoryEmoji(d, 'rent', '🏠');
    expect(emojiFor(getEmojiMap(d), 'rent')).toBe('🏠');
    expect(emojiFor(getEmojiMap(d), 'unknown')).toBe(FALLBACK_EMOJI);
  });

  it('sets and clears a hue (null = auto) without disturbing the emoji', () => {
    const d = db();
    setCategoryEmoji(d, 'rent', '🏠');
    setCategoryHue(d, 'rent', 200);
    expect(hueFor(getHueMap(d), 'rent')).toBe(200);
    setCategoryHue(d, 'rent', null);
    expect(hueFor(getHueMap(d), 'rent')).toBeUndefined();
    expect(emojiFor(getEmojiMap(d), 'rent')).toBe('🏠'); // still there
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/categories/queries.test.ts`
Expected: FAIL — `categoryIdFor` not exported; `getEmojiMap` still reads `category_meta`.

- [ ] **Step 3: Port the queries**

In `src/features/categories/queries.ts`: keep `FALLBACK_EMOJI`, `EMOJI_CHOICES`, `EMOJI_LABELS`, `emojiFor`, `hueFor` exactly as they are. Change the import line and the four DB functions, and **delete `renameCategoryMeta` entirely** (its job now lives in `entries/queries.renameCategory`, Task 5). Replace:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { categoryMeta } from './schema';
```

with:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { categories } from './schema';
```

Replace `getEmojiMap`:

```ts
export function getEmojiMap(db: Db): Record<string, string> {
  const rows = db.select({ name: categories.name, emoji: categories.emoji }).from(categories).all();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.name] = row.emoji;
  return map;
}
```

Replace `setCategoryEmoji` (upsert on the unique `name`):

```ts
// Upsert: assigning an emoji to a category replaces any prior one. Creates the category row if the
// name is new (a category with no entries yet is now legitimate).
export function setCategoryEmoji(db: Db, category: string, emoji: string): void {
  db.insert(categories)
    .values({ name: category, emoji })
    .onConflictDoUpdate({ target: categories.name, set: { emoji } })
    .run();
}
```

Replace `getHueMap`:

```ts
export function getHueMap(db: Db): Record<string, number> {
  const rows = db.select({ name: categories.name, hue: categories.hue }).from(categories).all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.hue !== null) map[row.name] = row.hue;
  return map;
}
```

Replace `setCategoryHue`:

```ts
// Upsert the hue. `null` resets to auto. A new name gets the fallback emoji to satisfy NOT NULL; an
// existing row keeps its emoji (only hue changes).
export function setCategoryHue(db: Db, category: string, hue: number | null): void {
  db.insert(categories)
    .values({ name: category, emoji: FALLBACK_EMOJI, hue })
    .onConflictDoUpdate({ target: categories.name, set: { hue } })
    .run();
}
```

Add `categoryIdFor` (used by every entry/budget write to resolve a name to its id):

```ts
// Resolve a category name to its id, creating the row (fallback emoji) if the name is new. This is the
// single write-boundary that turns the name-based UI/import into id-based storage. Idempotent.
export function categoryIdFor(db: Db, name: string): number {
  db.insert(categories)
    .values({ name, emoji: FALLBACK_EMOJI })
    .onConflictDoNothing({ target: categories.name })
    .run();
  const row = db.select({ id: categories.id }).from(categories).where(eq(categories.name, name)).get();
  if (!row) throw new Error(`categoryIdFor: could not resolve category "${name}"`);
  return row.id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/categories/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `categories/actions.ts` (mechanical) and its callers' import name**

In `src/features/categories/actions.ts`, change both occurrences of `ensureCategoryMetaTable` to `ensureCategoriesTable` and update the import:

```ts
import { ensureCategoriesTable } from './schema';
```

…and replace the two `ensureCategoryMetaTable(db);` calls with `ensureCategoriesTable(db);`. The `setCategoryEmoji`/`setCategoryHue` calls are unchanged (still name-keyed).

- [ ] **Step 6: Run typecheck for the categories feature surface**

Run: `npm run typecheck`
Expected: errors ONLY in files that still import `categoryMeta` / `ensureCategoryMetaTable` / `renameCategoryMeta` (entries actions/queries, app pages) — those are fixed in Tasks 4–8. The categories feature itself is clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/categories/queries.ts src/features/categories/queries.test.ts src/features/categories/actions.ts
git commit -m "feat(features): category emoji/hue and id lookup on the categories table" -m "getEmojiMap/getHueMap/setCategoryEmoji/setCategoryHue now read/write categories (same name-keyed shape, so the UI is unchanged). Adds categoryIdFor for name→id resolution at the write boundary; renameCategoryMeta is gone (folded into the id-aware rename)."
```

---

## Task 4: Flip `entries` schema to `category_id` + add write/read types

**Files:**
- Modify: `src/features/entries/schema.ts`
- Modify: `src/features/entries/entry-form.ts`
- Modify: `src/features/entries/seed.ts`
- Modify: `src/features/entries/import.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/features/entries/entries.test.ts` (or the schema test file) a shape assertion:

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable, entries } from './schema';
import { sql } from 'drizzle-orm';

describe('ensureEntriesTable (id-keyed)', () => {
  it('creates entries with a category_id column and no category text column', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    const cols = db.all(sql`PRAGMA table_info(entries)`).flatMap((r) =>
      typeof r === 'object' && r !== null && 'name' in r && typeof r.name === 'string' ? [r.name] : [],
    );
    expect(cols).toContain('category_id');
    expect(cols).not.toContain('category');
    // the categories table is bootstrapped alongside (via migrateCategoryIds)
    db.insert(entries).values({ date: '2026-07-01', account: 'cash', categoryId: 1, amount: -5 }).run();
    expect(db.select().from(entries).all()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/entries/entries.test.ts`
Expected: FAIL — `categoryId` not a valid insert key; `category` still in the schema.

- [ ] **Step 3: Rewrite the entries schema**

Replace `src/features/entries/schema.ts` with:

```ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { migrateCategoryIds } from '@db/migrate';
import type { Db } from '@db/client';

// The money-flow ledger — one row per inflow/outflow. `amount` is signed THB (the converted value)
// and is the basis for every rollup. `currency` + `originalAmount` preserve the source currency for
// non-THB rows so the import is lossless; they are informational only. `time` is a nullable 24h
// 'HH:MM'. `category_id` is a FK into categories.id (nullable at the DB level — SQLite can't ALTER to
// NOT NULL; app writes always set it). This file is the schema source of truth.
export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time'), // 24h 'HH:MM', nullable
  account: text('account').notNull(),
  categoryId: integer('category_id'), // FK → categories.id; app enforces non-null on write
  amount: real('amount').notNull(), // signed THB (converted)
  currency: text('currency'),
  originalAmount: real('original_amount'),
  note: text('note'),
  source: text('source').notNull().default('manual'), // 'manual' | 'monefy'
});

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;

// A read row for the UI: the stored entry plus the joined category NAME. Read queries project this so
// every display surface keeps working with names while storage uses ids.
export type EntryRow = Entry & { category: string };

// The write-time input the pure parsers/seed/import produce: a category NAME (resolved to category_id
// at the DB boundary by the query layer), not an id. Everything else matches NewEntry.
export type EntryInput = {
  date: string;
  time?: string | null;
  account: string;
  category: string;
  amount: number;
  currency?: string | null;
  originalAmount?: number | null;
  note?: string | null;
  source?: string;
};

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap. Fresh installs get category_id directly; existing
// text-keyed DBs are upgraded by migrateCategoryIds (idempotent, guarded, invoked here so any page
// that ensures entries triggers the one-time backfill).
export function ensureEntriesTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT,
      account TEXT NOT NULL,
      category_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT,
      original_amount REAL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual'
    )
  `);
  migrateCategoryIds(db);
}
```

- [ ] **Step 4: Re-point the pure producers to `EntryInput` (bodies unchanged)**

`src/features/entries/entry-form.ts` — change the import and the two `NewEntry` references:

```ts
import type { EntryInput } from './schema';
```
```ts
export type ParseResult = { ok: true; entry: EntryInput } | { ok: false; error: string };
```
```ts
  const entry: EntryInput = {
```
The object literal body is unchanged (it already sets `category`, not `categoryId`).

`src/features/entries/seed.ts` — change the import + the `DEMO` type:

```ts
import { entries, type EntryInput } from './schema';
```
```ts
const DEMO: EntryInput[] = [
```
Body unchanged.

`src/features/entries/import.ts` — change the type import + the two return-type annotations (`ImportResult` and the array), bodies unchanged:

```ts
import type { EntryInput } from './schema';
```
```ts
export type ImportResult = { entries: EntryInput[]; skipped: number };
```
```ts
  const entries: EntryInput[] = [];
```

- [ ] **Step 5: Run tests to verify entry-form / import / seed still pass**

Run: `npm test -- src/features/entries/entry-form.test.ts src/features/entries/import.test.ts`
Expected: PASS — these assert on the `category` name, which `EntryInput` still carries, so no behavior changed.

Run: `npm test -- src/features/entries/entries.test.ts`
Expected: the new schema shape test PASSES. (Other tests in this file that call `addEntries`/`getEntries` will fail until Task 5 re-points `queries.ts` — that is expected; fix them in Task 5.)

- [ ] **Step 6: Commit**

```bash
git add src/features/entries/schema.ts src/features/entries/entry-form.ts src/features/entries/seed.ts src/features/entries/import.ts
git commit -m "feat(features): entries store category_id, parsers emit EntryInput names" -m "entries.category text → category_id FK. Adds EntryRow (read: entry + joined name) and EntryInput (write: category name, resolved to id at the DB boundary). Pure parsers/seed keep emitting names — only their type annotations change."
```

---

## Task 5: Port `entries/queries.ts` — join reads, id writes, id-aware rename/merge

**Files:**
- Modify: `src/features/entries/queries.ts`
- Modify: `src/features/entries/queries.test.ts`

This is the core query task. Reads join `categories` and project `category` (name); writes resolve name→id via `categoryIdFor`; `renameCategory` becomes rename-or-merge over the categories table + entries reassignment.

- [ ] **Step 1: Write the failing tests**

Update `src/features/entries/queries.test.ts`. Setup must now `ensureEntriesTable` (which bootstraps categories too). Key new/changed assertions:

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import {
  addEntries, getEntries, getEntriesInRange, getCategoryBreakdown, getCategoryCounts,
  getDistinctCategories, renameCategory, searchEntries, insertEntry, getEntryById,
} from './queries';
import { categoryIdFor, setCategoryEmoji } from '@features/categories/queries';

function db() {
  const d = initDb(':memory:');
  ensureEntriesTable(d);
  return d;
}

describe('entries read rows carry the category name (joined)', () => {
  it('addEntries resolves the name to an id; reads project the name back', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 }]);
    const [row] = getEntries(d);
    expect(row.category).toBe('groceries');
    expect(row.categoryId).toEqual(expect.any(Number));
  });
});

describe('getCategoryBreakdown', () => {
  it('groups expenses by category name via the join', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'groceries', amount: -50 },
      { date: '2026-07-03', account: 'bank', category: 'rent', amount: -900 },
    ]);
    expect(getCategoryBreakdown(d, '2026-07-01', '2026-07-31')).toEqual([
      { key: 'rent', total: -900, count: 1 },
      { key: 'groceries', total: -150, count: 2 },
    ]);
  });
});

describe('getCategoryCounts includes empty categories', () => {
  it('shows a category with no entries at count 0', () => {
    const d = db();
    setCategoryEmoji(d, 'empty-cat', '🏷️'); // creates a category row with zero entries
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 }]);
    const counts = getCategoryCounts(d);
    expect(counts).toContainEqual({ category: 'groceries', count: 1 });
    expect(counts).toContainEqual({ category: 'empty-cat', count: 0 });
  });
});

describe('getDistinctCategories lists all categories (including empty)', () => {
  it('returns names from the categories table, ordered', () => {
    const d = db();
    categoryIdFor(d, 'rent');
    categoryIdFor(d, 'groceries');
    expect(getDistinctCategories(d)).toEqual(['groceries', 'rent']);
  });
});

describe('renameCategory', () => {
  it('pure rename keeps the same id and its emoji/hue', () => {
    const d = db();
    setCategoryEmoji(d, 'grocery', '🛒');
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'grocery', amount: -100 }]);
    const idBefore = getEntries(d)[0].categoryId;
    renameCategory(d, 'grocery', 'groceries');
    const row = getEntries(d)[0];
    expect(row.category).toBe('groceries');
    expect(row.categoryId).toBe(idBefore); // same identity — no entry rewrite
    expect(getDistinctCategories(d)).toEqual(['groceries']);
  });

  it('merges into an existing target: entries move, source category is deleted', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'dining', amount: -50 },
    ]);
    const target = getEntries(d).find((r) => r.category === 'dining')?.categoryId;
    renameCategory(d, 'food', 'dining');
    const rows = getEntries(d);
    expect(rows.every((r) => r.category === 'dining')).toBe(true);
    expect(rows.every((r) => r.categoryId === target)).toBe(true);
    expect(getDistinctCategories(d)).toEqual(['dining']); // 'food' gone
  });

  it('is a no-op when the source category does not exist', () => {
    const d = db();
    categoryIdFor(d, 'rent');
    renameCategory(d, 'ghost', 'rent');
    expect(getDistinctCategories(d)).toEqual(['rent']);
  });
});

describe('searchEntries matches the joined category name', () => {
  it('finds an entry by a substring of its category', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 }]);
    expect(searchEntries(d, 'groc')).toHaveLength(1);
    expect(searchEntries(d, 'groc')[0].category).toBe('groceries');
  });
});
```

(Keep the existing `replaceEntries`, `getDistinctAccounts`, `getForeignEntries`, summary tests — update their setup to `ensureEntriesTable` and their input rows to use `category:` names, which they already do.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — queries still reference `entries.category`.

- [ ] **Step 3: Rewrite the queries**

Replace the imports at the top of `src/features/entries/queries.ts`:

```ts
import { desc, and, or, eq, gte, lte, lt, sql, isNotNull, ne, type AnyColumn } from 'drizzle-orm';
import type { Db } from '@db/client';
import { entries, type Entry, type EntryRow, type EntryInput } from './schema';
import { categories } from '@features/categories/schema';
import { categoryIdFor } from '@features/categories/queries';
import { budgets } from '@features/budgets/schema';
```

Add a private read-row selector and re-point every function that returns entries to use it. Insert near the top of the file:

```ts
// Every read that returns entries for the UI projects this shape: the stored columns plus the joined
// category NAME. innerJoin because every entry has a category_id after migration and on every write.
const entryRowColumns = {
  id: entries.id,
  date: entries.date,
  time: entries.time,
  account: entries.account,
  categoryId: entries.categoryId,
  category: categories.name,
  amount: entries.amount,
  currency: entries.currency,
  originalAmount: entries.originalAmount,
  note: entries.note,
  source: entries.source,
};

function entryRowsQuery(db: Db) {
  return db.select(entryRowColumns).from(entries).innerJoin(categories, eq(entries.categoryId, categories.id));
}
```

Change the write functions to resolve name→id:

```ts
export function addEntries(db: Db, rows: EntryInput[]): void {
  if (rows.length === 0) return;
  const resolved = rows.map(({ category, ...rest }) => ({ ...rest, categoryId: categoryIdFor(db, category) }));
  db.insert(entries).values(resolved).run();
}
```

```ts
export function insertEntry(db: Db, entry: EntryInput): void {
  const { category, ...rest } = entry;
  db.insert(entries).values({ ...rest, categoryId: categoryIdFor(db, category) }).run();
}

export function updateEntry(db: Db, id: number, entry: EntryInput): void {
  const { category, ...rest } = entry;
  db.update(entries).set({ ...rest, categoryId: categoryIdFor(db, category) }).where(eq(entries.id, id)).run();
}
```

```ts
export function replaceEntries(db: Db, rows: EntryInput[]): void {
  const chunkSize = 500;
  db.transaction((tx) => {
    tx.delete(entries).where(eq(entries.source, 'monefy')).run();
    const resolved = rows.map(({ category, ...rest }) => ({ ...rest, categoryId: categoryIdFor(tx, category) }));
    for (let i = 0; i < resolved.length; i += chunkSize) {
      tx.insert(entries).values(resolved.slice(i, i + chunkSize)).run();
    }
  });
}
```

> Note: `categoryIdFor(tx, …)` — the transaction handle is a `Db` too, so category rows created during the import commit atomically with the entries. `getNetFlow`/`getEntries` etc. below return rows.

Change `getEntries` and the range/summary reads to project the name. `summarize`/`getNetFlow` operate on numeric fields only, so they can keep taking `Entry`-ish rows — but simplest is to type them against `EntryRow`:

```ts
export function getEntries(db: Db): EntryRow[] {
  return entryRowsQuery(db).all();
}
```

```ts
export function getEntriesInRange(db: Db, start: string, end: string): EntryRow[] {
  return entryRowsQuery(db)
    .where(and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0)))
    .all();
}
```

`getNetFlow` and `summarize` reference only `.amount`/sign — update their parameter type from `Entry[]` to `EntryRow[]` (or leave `summarize` typed against a `{ amount: number }` structural subset). Minimal change: `function summarize(rows: EntryRow[])` and `getNetFlow` calls `getEntries(db)` which now returns `EntryRow[]` — no body change.

`getEntryById`, `searchEntries`, `getForeignEntries` — project via the join:

```ts
export function getEntryById(db: Db, id: number): EntryRow | undefined {
  return entryRowsQuery(db).where(eq(entries.id, id)).get();
}
```

```ts
export function searchEntries(db: Db, query: string): EntryRow[] {
  const q = query.trim();
  if (!q) return [];
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const has = (col: AnyColumn) => sql`${col} like ${pattern} escape '\\'`;
  return entryRowsQuery(db)
    .where(
      and(
        lt(entries.amount, 0),
        or(has(entries.note), has(categories.name), has(entries.account)),
      ),
    )
    .orderBy(desc(entries.date), desc(entries.time), desc(entries.id))
    .all();
}
```

```ts
export function getForeignEntries(db: Db): EntryRow[] {
  return entryRowsQuery(db)
    .where(and(isNotNull(entries.currency), ne(entries.currency, 'THB')))
    .orderBy(entries.date, entries.id)
    .all();
}
```

`groupSum` / `getCategoryBreakdown` — the category variant must group by the joined name; the account variant is unchanged. Split them cleanly:

```ts
export type Breakdown = { key: string; total: number; count: number };

function rangeExpense(start: string, end: string) {
  return and(gte(entries.date, start), lte(entries.date, end), lt(entries.amount, 0));
}

export function getCategoryBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return db
    .select({ key: categories.name, total: sql<number>`sum(${entries.amount})`, count: sql<number>`count(*)` })
    .from(entries)
    .innerJoin(categories, eq(entries.categoryId, categories.id))
    .where(rangeExpense(start, end))
    .groupBy(categories.name)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export function getAccountBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return db
    .select({ key: entries.account, total: sql<number>`sum(${entries.amount})`, count: sql<number>`count(*)` })
    .from(entries)
    .where(rangeExpense(start, end))
    .groupBy(entries.account)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
```

> If nothing currently calls a by-account breakdown, drop `getAccountBreakdown` (YAGNI) and just inline the category one. Check callers with `grep -rn "groupSum\|getAccountBreakdown" src` before deciding. The original `groupSum` took a `column` param but only `getCategoryBreakdown` used it — verify and delete the dead generality.

`getDistinctCategories` — now lists all categories (incl. empty), ordered by name (sort_order is inert until the management UI):

```ts
export function getDistinctCategories(db: Db): string[] {
  return db.select({ name: categories.name }).from(categories).orderBy(categories.name).all().map((r) => r.name);
}
```

`getCategoryCounts` — left join so zero-entry categories appear:

```ts
export type CategoryCount = { category: string; count: number };

export function getCategoryCounts(db: Db): CategoryCount[] {
  return db
    .select({ category: categories.name, count: sql<number>`count(${entries.id})` })
    .from(categories)
    .leftJoin(entries, eq(entries.categoryId, categories.id))
    .groupBy(categories.id)
    .all()
    .sort((a, b) => b.count - a.count);
}
```

`renameCategory` — rename the categories row, or merge if the target name already exists:

```ts
// Rename a category by id, or MERGE when `to` already names a different category: reassign this
// category's entries to the target, drop this category's per-category budget (target's budget wins),
// then delete the now-empty source row. A pure rename keeps the same id — entries are never rewritten,
// and the emoji/hue on the row follow the rename for free. No-op when `from` doesn't exist.
export function renameCategory(db: Db, from: string, to: string): void {
  const source = db.select({ id: categories.id }).from(categories).where(eq(categories.name, from)).get();
  if (!source) return;
  const target = db.select({ id: categories.id }).from(categories).where(eq(categories.name, to)).get();
  if (target && target.id !== source.id) {
    db.transaction((tx) => {
      tx.update(entries).set({ categoryId: target.id }).where(eq(entries.categoryId, source.id)).run();
      // ponytail: on merge the source's per-category budget is dropped, target's wins; a smarter
      // policy (sum the caps) only if users ask.
      tx.delete(budgets).where(eq(budgets.categoryId, source.id)).run();
      tx.delete(categories).where(eq(categories.id, source.id)).run();
    });
  } else {
    db.update(categories).set({ name: to }).where(eq(categories.id, source.id)).run();
  }
}
```

> `budgets` is imported at the top for the merge reassignment. If Task 6 (budgets schema flip) hasn't run yet, `budgets.categoryId` won't exist as a column — sequence Task 6 immediately after this task, or move the `budgets` cleanup line behind Task 6. Recommended order: do Task 6 right after Task 5's tests pass, before the full typecheck gate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/entries/queries.test.ts src/features/entries/entries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): entries queries join categories, resolve names to ids on write" -m "Reads project the joined category name (EntryRow) so the UI is unchanged; writes resolve name→id via categoryIdFor. renameCategory is now an id-aware rename-or-merge that reassigns entries + budgets instead of rewriting the category string across the ledger."
```

---

## Task 6: Flip `budgets` schema + queries to `category_id`

**Files:**
- Modify: `src/features/budgets/schema.ts`
- Modify: `src/features/budgets/queries.ts`
- Modify: `src/features/budgets/queries.test.ts`
- Modify: `src/features/budgets/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Update `src/features/budgets/queries.test.ts`. `getBudgets` returns rows carrying the category **name** (null for the total row); `setBudget`/`deleteBudget` still take a name (or null):

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureBudgetsTable } from './schema';
import { getBudgets, setBudget, deleteBudget } from './queries';

function db() {
  const d = initDb(':memory:');
  ensureBudgetsTable(d);
  return d;
}

describe('budgets keyed by category_id, read back by name', () => {
  it('sets a per-category budget and a total, reads names back', () => {
    const d = db();
    setBudget(d, 'groceries', 3000);
    setBudget(d, null, 20000);
    const rows = getBudgets(d);
    expect(rows).toContainEqual(expect.objectContaining({ category: 'groceries', amount: 3000 }));
    expect(rows).toContainEqual(expect.objectContaining({ category: null, amount: 20000 }));
  });

  it('upserts by category (replaces the old amount, no duplicate row)', () => {
    const d = db();
    setBudget(d, 'groceries', 3000);
    setBudget(d, 'groceries', 3500);
    const grocery = getBudgets(d).filter((r) => r.category === 'groceries');
    expect(grocery).toHaveLength(1);
    expect(grocery[0].amount).toBe(3500);
  });

  it('deletes a per-category budget and the total independently', () => {
    const d = db();
    setBudget(d, 'groceries', 3000);
    setBudget(d, null, 20000);
    deleteBudget(d, 'groceries');
    expect(getBudgets(d).some((r) => r.category === 'groceries')).toBe(false);
    expect(getBudgets(d).some((r) => r.category === null)).toBe(true);
    deleteBudget(d, null);
    expect(getBudgets(d)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/budgets/queries.test.ts`
Expected: FAIL.

- [ ] **Step 3: Flip the schema**

Replace `src/features/budgets/schema.ts`:

```ts
import { sqliteTable, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { migrateCategoryIds } from '@db/migrate';
import type { Db } from '@db/client';

// Standing budgets — no cycle column; the same limit applies to every billing cycle. The row with
// category_id IS NULL is the TOTAL (whole-cycle) budget; category_id rows are per-category caps.
// Amounts are positive monthly limits, compared against spend magnitudes.
export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id'), // NULL = the total budget row; else FK → categories.id
  amount: real('amount').notNull(),
});

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

// A read row for the UI: the budget plus the joined category NAME (null for the total row).
export type BudgetReadRow = { id: number; categoryId: number | null; category: string | null; amount: number };

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap; migrateCategoryIds upgrades an existing text-keyed
// budgets table (adds + backfills category_id) — invoked here so ensuring budgets triggers the backfill.
export function ensureBudgetsTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      amount REAL NOT NULL
    )
  `);
  migrateCategoryIds(db);
}
```

Update `src/features/budgets/schema.test.ts` if it asserts the old column name (`category`) — change to `categoryId`.

- [ ] **Step 4: Port the queries**

Replace `src/features/budgets/queries.ts`:

```ts
import { eq, isNull } from 'drizzle-orm';
import type { Db } from '@db/client';
import { budgets, type BudgetReadRow } from './schema';
import { categories } from '@features/categories/schema';
import { categoryIdFor } from '@features/categories/queries';

// Read budgets with their category name joined (null for the total row) so the page + budget-status
// model keep working with names. leftJoin because the total row has a null category_id.
export function getBudgets(db: Db): BudgetReadRow[] {
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      category: categories.name,
      amount: budgets.amount,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .all();
}

// Upsert-by-category (or the null-category total). Delete+insert rather than ON CONFLICT: NULLs are
// never equal in a UNIQUE index, so the total row can't be conflict-upserted; isNull handles it
// explicitly. A per-category budget resolves its name to an id (creating the category if new).
export function setBudget(db: Db, category: string | null, amount: number): void {
  const categoryId = category === null ? null : categoryIdFor(db, category);
  db.transaction((tx) => {
    if (categoryId === null) tx.delete(budgets).where(isNull(budgets.categoryId)).run();
    else tx.delete(budgets).where(eq(budgets.categoryId, categoryId)).run();
    tx.insert(budgets).values({ categoryId, amount }).run();
  });
}

export function deleteBudget(db: Db, category: string | null): void {
  if (category === null) {
    db.delete(budgets).where(isNull(budgets.categoryId)).run();
    return;
  }
  const row = db.select({ id: categories.id }).from(categories).where(eq(categories.name, category)).get();
  if (!row) return; // unknown category → nothing to delete
  db.delete(budgets).where(eq(budgets.categoryId, row.id)).run();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/features/budgets/queries.test.ts src/features/budgets/schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Check the budgets page/actions still type-check**

The budgets page builds `limits` / `spentByCategory` maps keyed by name for `toBudgetRows`. Since `getBudgets` now returns `category` (name), map over `.category` (skip the null total row when building the per-category `limits` map — it was `null`-category before too, so the existing null-guard carries over).

Run: `npm run typecheck`
Expected: budgets feature clean. Remaining errors only in `entries/actions.ts` + app pages (Tasks 7–8).

- [ ] **Step 7: Commit**

```bash
git add src/features/budgets/schema.ts src/features/budgets/queries.ts src/features/budgets/queries.test.ts src/features/budgets/schema.test.ts
git commit -m "feat(features): budgets reference categories by id" -m "budgets.category text → category_id FK (NULL still = the total row). getBudgets joins the category name back so budget-status and the page stay name-based; setBudget/deleteBudget resolve name→id."
```

---

## Task 7: Wire actions + app pages; drop `renameCategoryMeta` usage

**Files:**
- Modify: `src/features/entries/actions.ts`
- Modify: `src/app/page.tsx`, `src/app/records/page.tsx`, `src/app/categories/page.tsx`, `src/app/budgets/page.tsx`, `src/app/entries/new/page.tsx`

- [ ] **Step 1: Fix `entries/actions.ts`**

`mergeCategoryAction` no longer calls `renameCategoryMeta` (folded into `renameCategory`). Replace the imports and the action:

Remove:
```ts
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { renameCategoryMeta } from '@features/categories/queries';
```
Add:
```ts
import { ensureCategoriesTable } from '@features/categories/schema';
```
Replace the body of `mergeCategoryAction`:
```ts
export async function mergeCategoryAction(formData: FormData): Promise<void> {
  const input = parseMergeInput(formData);
  if (input === null) return;

  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  renameCategory(db, input.from, input.to); // rename, or merge when `to` already exists
  revalidatePath('/', 'layout');
}
```
`addEntryAction` / `editEntryAction` are unchanged — they pass `result.entry` (an `EntryInput`) to `insertEntry`/`updateEntry`, which now resolve the id.

- [ ] **Step 2: Rename the ensure import in the 5 app pages**

In each of `src/app/page.tsx`, `src/app/records/page.tsx`, `src/app/categories/page.tsx`, `src/app/budgets/page.tsx`, `src/app/entries/new/page.tsx`:
- change `import { ensureCategoryMetaTable } from '@features/categories/schema';` → `import { ensureCategoriesTable } from '@features/categories/schema';`
- change the `ensureCategoryMetaTable(db);` call → `ensureCategoriesTable(db);`

Find them all: `grep -rln "ensureCategoryMetaTable" src/app`.

- [ ] **Step 3: Full typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: CLEAN. If anything still imports `categoryMeta`, `ensureCategoryMetaTable`, or `renameCategoryMeta`, fix it — those symbols no longer exist.

- [ ] **Step 4: Full test run**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/entries/actions.ts src/app
git commit -m "feat(app): wire category id migration through actions and pages" -m "mergeCategoryAction delegates to the id-aware renameCategory (no separate meta move). All pages bootstrap via ensureCategoriesTable."
```

---

## Task 8: Phase-2 cleanup — drop legacy text columns + `category_meta`

**Files:**
- Modify: `src/db/migrate.test.ts`
- Modify: `src/features/entries/schema.ts`, `src/features/budgets/schema.ts` (wire `dropLegacyCategoryColumns` into the ensure path)

- [ ] **Step 1: Write the failing test**

Add to `src/db/migrate.test.ts`:

```ts
import { migrateCategoryIds, dropLegacyCategoryColumns } from './migrate';

describe('dropLegacyCategoryColumns', () => {
  it('drops the vestigial category text columns and category_meta after backfill', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    dropLegacyCategoryColumns(db);
    const cols = (t: string) =>
      db.all(sql`PRAGMA table_info(${sql.raw(t)})`).flatMap((r) =>
        typeof r === 'object' && r !== null && 'name' in r && typeof r.name === 'string' ? [r.name] : [],
      );
    expect(cols('entries')).toContain('category_id');
    expect(cols('entries')).not.toContain('category');
    expect(cols('budgets')).not.toContain('category');
    expect(db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='category_meta'`)).toHaveLength(0);
  });

  it('is idempotent and safe on an already-clean DB', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    dropLegacyCategoryColumns(db);
    expect(() => dropLegacyCategoryColumns(db)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/migrate.test.ts`
Expected: FAIL — `dropLegacyCategoryColumns` isn't wired into the ensure path, but the function itself already exists from Task 2, so these direct-call tests should actually PASS immediately. If they pass, that confirms Task 2's phase-2 function is correct; proceed to wire it.

- [ ] **Step 3: Wire the drop into the ensure path**

So a real DB actually sheds the columns on next load, call `dropLegacyCategoryColumns` right after `migrateCategoryIds` inside `ensureEntriesTable` and `ensureBudgetsTable`. In `src/features/entries/schema.ts`:

```ts
import { migrateCategoryIds, dropLegacyCategoryColumns } from '@db/migrate';
```
```ts
export function ensureEntriesTable(db: Db): void {
  db.run(sql`CREATE TABLE IF NOT EXISTS entries ( … unchanged … )`);
  migrateCategoryIds(db);
  dropLegacyCategoryColumns(db);
}
```
Same two-line addition in `src/features/budgets/schema.ts`'s `ensureBudgetsTable`, and in `ensureCategoriesTable` (`categories/schema.ts`) add the `dropLegacyCategoryColumns(db)` call after `migrateCategoryIds(db)`.

> Ordering guarantee: `migrateCategoryIds` returns early if `category_id` already exists, and `dropLegacyCategoryColumns` only drops a `category` column when its `category_id` sibling is present — so on a legacy DB the very first ensure call backfills, and the *same* call (backfill ran → category_id now exists → drop runs) removes the columns. All within one page load. On a fresh install both are no-ops after the create.

- [ ] **Step 4: Run the whole gate**

```bash
npm run typecheck
npm run lint
npm test
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/migrate.test.ts src/features/entries/schema.ts src/features/budgets/schema.ts src/features/categories/schema.ts
git commit -m "chore(db): drop legacy category text columns after id backfill" -m "dropLegacyCategoryColumns removes entries.category, budgets.category, and the category_meta table once category_id is populated. Wired into the ensure path so a real DB sheds them on the next load. Idempotent."
```

---

## Task 9: End-to-end verification on a real copy of the DB

**Files:** none (verification only)

- [ ] **Step 1: Format backstop**

Run: `npm run format:check`
Expected: clean (run `npm run format` if not).

- [ ] **Step 2: Migrate a copy of the real DB and eyeball it**

Never touch `data/moniflow.db` directly — copy it first (it's git-ignored, real financial data).

```bash
cp data/moniflow.db /tmp/moniflow-migrate-check.db
MONIFLOW_DB=/tmp/moniflow-migrate-check.db npm run dev -- summary
```
Expected: the CLI `summary` runs without error (this triggers `ensureEntriesTable` → migrate → drop on the copy).

Then inspect the copy:
```bash
node -e "const D=require('better-sqlite3');const db=new D('/tmp/moniflow-migrate-check.db');
console.log('categories:', db.prepare('SELECT count(*) n FROM categories').get());
console.log('entries w/o category_id:', db.prepare('SELECT count(*) n FROM entries WHERE category_id IS NULL').get());
console.log('entries cols:', db.prepare('PRAGMA table_info(entries)').all().map(c=>c.name).join(','));
console.log('category_meta gone:', db.prepare(\"SELECT count(*) n FROM sqlite_master WHERE name='category_meta'\").get());"
```
Expected: `categories.n` > 0, `entries w/o category_id.n` = 0, `entries cols` includes `category_id` and NOT `category`, `category_meta gone.n` = 0.

- [ ] **Step 3: Drive the app (use the `/run` skill or the running dev server)**

Point the dev server at the migrated copy and click through: home donut + breakdown render with the right emoji/colors; records list shows category names; rename a category (records/categories page) and confirm entries follow; a rename onto an existing name merges; add an entry with a brand-new category name and confirm it appears; budgets page shows per-category + total meters.

```bash
MONIFLOW_DB=/tmp/moniflow-migrate-check.db npm run dev:web
```
Expected: every category surface works; no console errors; the new category exists after add.

- [ ] **Step 4: Clean up the scratch DB**

```bash
rm -f /tmp/moniflow-migrate-check.db /tmp/moniflow-migrate-check.db-wal /tmp/moniflow-migrate-check.db-shm
```

- [ ] **Step 5: Final branch state**

Run: `git status` (clean), `git log --oneline main..HEAD` (the 8 commits above).
The feature branch `feat/category-id-pk` is ready to merge.

---

## Self-review notes (for the implementer)

- **Spec coverage:** id PK + FK (T4/T6), rename-without-rewrite + stable identity (T5 renameCategory), add-category-first (T3 `categoryIdFor` / `setCategoryEmoji` create empty rows; T5 write path), `sort_order`/`archived` columns (T1), two-phase migration (T2/T8), import upsert (T4 EntryInput + T5 replaceEntries), keep-names-at-boundary UI-invariance (T5 EntryRow join). Subcategories intentionally out (spec §Scope).
- **Type consistency:** `EntryInput` (write, has `category` name) vs `NewEntry` (drizzle insert, has `categoryId`) vs `EntryRow`/`Entry` (read; `EntryRow` adds the joined `category` name). `categoryIdFor(db|tx, name) → number`. `renameCategory(db, from, to)` is the single rename/merge entry point. `BudgetReadRow` mirrors `EntryRow` for budgets.
- **Sequencing caveat:** Task 5's `renameCategory` imports the `budgets` table; do Task 6 immediately after Task 5 (before running the repo-wide typecheck gate) so `budgets.categoryId` exists. Within Tasks 1–2 there's a mutual reference (schema delegates to migrate) — implement Task 2's `migrate.ts` before or together with Task 1, or stub `migrateCategoryIds` first as the Task 1 note says.
