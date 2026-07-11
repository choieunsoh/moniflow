import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { migrateCategoryIds, dropLegacyCategoryColumns } from '@db/migrate';
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
// invoked here and from ensureEntriesTable/ensureBudgetsTable so any read path triggers it;
// dropLegacyCategoryColumns then removes the legacy `category` columns and the category_meta table.
export function ensureCategoriesTable(db: Db): void {
  migrateCategoryIds(db);
  dropLegacyCategoryColumns(db);
}
