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
