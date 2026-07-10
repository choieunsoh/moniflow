import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// Per-category display metadata — an emoji plus an optional hue, shown alongside the category
// everywhere (records, donut legend, category picker). Keyed by the category NAME because categories
// are plain text on entries, not their own table; a rename/merge can orphan a row, which is harmless
// (unused meta). `hue` overrides the name-derived disc color (null = auto). This file is the schema
// source of truth; drizzle.config globs it automatically.
export const categoryMeta = sqliteTable('category_meta', {
  category: text('category').primaryKey(),
  emoji: text('emoji').notNull(),
  hue: integer('hue'),
});

export type CategoryMeta = typeof categoryMeta.$inferSelect;
export type NewCategoryMeta = typeof categoryMeta.$inferInsert;

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap, matching the other features' scaffold pattern.
export function ensureCategoryMetaTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS category_meta (
      category TEXT PRIMARY KEY,
      emoji TEXT NOT NULL,
      hue INTEGER
    )
  `);
  // CREATE IF NOT EXISTS won't alter a table made before `hue` existed — add it if missing.
  const cols = db.all(sql`PRAGMA table_info(category_meta)`);
  const hasHue = cols.some(
    (c) => typeof c === 'object' && c !== null && 'name' in c && c.name === 'hue',
  );
  if (!hasHue) db.run(sql`ALTER TABLE category_meta ADD COLUMN hue INTEGER`);
}
