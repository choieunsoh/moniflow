import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// The money-flow ledger — one row per inflow/outflow. amount is signed (+ inflow, - outflow),
// in THB. Derived totals (balances, category rollups) are computed in queries, never stored.
// This file is the schema source of truth for the `entries` feature; after any edit here,
// re-run `npm run db:generate`.
export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  account: text('account').notNull(),
  category: text('category').notNull(),
  amount: real('amount').notNull(), // signed THB
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
      account TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT
    )
  `);
}
