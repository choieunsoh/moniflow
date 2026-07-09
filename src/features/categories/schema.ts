import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// Per-category display metadata — currently just an emoji shown alongside the category everywhere
// (records, donut legend, category picker). Keyed by the category NAME because categories are plain
// text on entries, not their own table; a rename/merge can orphan a row, which is harmless (an unused
// emoji). This file is the schema source of truth; drizzle.config globs it automatically.
export const categoryMeta = sqliteTable('category_meta', {
  category: text('category').primaryKey(),
  emoji: text('emoji').notNull(),
});

export type CategoryMeta = typeof categoryMeta.$inferSelect;
export type NewCategoryMeta = typeof categoryMeta.$inferInsert;

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap, matching the other features' scaffold pattern.
export function ensureCategoryMetaTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS category_meta (
      category TEXT PRIMARY KEY,
      emoji TEXT NOT NULL
    )
  `);
}
