import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// Generic key-value settings store — deliberately not cutoff-specific, so future single-value
// settings (currency display, theme, …) reuse this table instead of each needing its own
// migration. This slice only ever writes one key: 'cutoff_day'.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Setting = typeof settings.$inferSelect;

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap, same pattern as ensureEntriesTable — no
// migration runner yet. Upgrade path: `npm run db:generate` + replay at the composition root once
// the schema stops being trivial.
export async function ensureSettingsTable(db: Db): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}
