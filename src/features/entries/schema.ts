import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { migrateCategoryIds, dropLegacyCategoryColumns } from '@db/migrate';
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
  dropLegacyCategoryColumns(db);
}
