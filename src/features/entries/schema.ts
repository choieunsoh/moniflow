import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import type { Db } from '@db/client';

// The money-flow ledger — one row per inflow/outflow. `amount` is signed THB (the converted value)
// and is the basis for every rollup. `currency` + `originalAmount` preserve the source currency for
// non-THB rows so the import is lossless; they are informational only. `time` is a nullable 24h
// 'HH:MM'. `category_id` is a FK into categories.id and `account_id` a FK into accounts.id (both
// nullable at the DB level — SQLite can't ALTER to NOT NULL; app writes always set them). This file
// is the schema source of truth.
export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  time: text('time'), // 24h 'HH:MM', nullable
  accountId: integer('account_id'), // FK → accounts.id; app enforces non-null on write
  categoryId: integer('category_id'), // FK → categories.id; app enforces non-null on write
  amount: real('amount').notNull(), // signed THB (converted)
  currency: text('currency'),
  originalAmount: real('original_amount'),
  note: text('note'),
  source: text('source').notNull().default('manual'), // 'manual' | 'monefy'
  // off_budget: null = inherit the category, 0 = force include, 1 = force exclude.
  offBudget: integer('off_budget'),
});

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;

// A read row for the UI: the stored entry plus the joined category + account NAMEs. Read queries
// project this so every display surface keeps working with names while storage uses ids.
export type EntryRow = Entry & { category: string; account: string };

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
  offBudget?: number | null;
};

// ponytail: ensures the ledger's FK tables (categories, accounts) alongside entries, so calling
// ensureEntriesTable alone yields a queryable ledger — the invariant migrate.ts used to provide.
export async function ensureEntriesTable(db: Db): Promise<void> {
  await ensureCategoriesTable(db);
  await ensureAccountsTable(db);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT,
      account_id INTEGER,
      category_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT,
      original_amount REAL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      off_budget INTEGER
    )
  `);
}

// Optional user-given names for trips (which are otherwise derived, not stored). Keyed by the trip's
// stable identity — `${currency}:${start}` (see tripId in trips.ts) — so a name sticks unless the
// trip's first day itself changes. A row exists only for a named trip; clearing a name deletes it.
export const tripTitles = sqliteTable('trip_titles', {
  id: text('id').primaryKey(), // `${currency}:${start}`
  title: text('title').notNull(),
});
export type TripTitle = typeof tripTitles.$inferSelect;

export async function ensureTripTitlesTable(db: Db): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS trip_titles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL
    )
  `);
}
