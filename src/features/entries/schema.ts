import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// The money-flow ledger — one row per inflow/outflow. `amount` is signed THB (the converted
// value) and is the basis for every rollup. `currency` + `originalAmount` preserve the source
// currency for non-THB rows (JPY/HKD) so the import is lossless; they are informational only.
// `time` is a nullable 24h 'HH:MM' — imported rows rarely carry one, hand-entered rows may.
// `source` distinguishes bulk-imported rows ('monefy') from hand-entered ones ('manual', the
// default) so re-running the import only truncates imported rows — see replaceEntries (Task 9).
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
  source: text('source').notNull().default('manual'), // 'manual' | 'monefy'
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
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual'
    )
  `);
}
