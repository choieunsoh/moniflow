import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import type { Db } from '@db/client';

// Standing rules that post themselves into the ledger — subscriptions (open-ended), bills, and
// installments (a fixed totalCount). This file is the schema source of truth; the shipping bootstrap
// duplicates the DDL in src/db/worker.ts and MUST stay in lockstep (schema.test.ts guards it).
//
// `lastPosted` is the ONLY mutable pointer. The payment number, paid count, and remaining count are
// all DERIVED from it in schedule.ts — never stored. That is what lets the backup rewind
// (rewindRecurrences) clamp one field and have the counters follow correctly; a stored seq counter
// would need lockstep unwinding and could silently drift.
//
// `amount` is stored POSITIVE (a bill reads as "฿2,000/mo" in the form); the sweep negates it, so the
// ledger's every-row-is-negative invariant holds.
export const recurrences = sqliteTable('recurrences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(), // 'Netflix' — becomes the entry note
  day: integer('day').notNull(), // 1–31, clamped to month length at post time
  intervalMonths: integer('interval_months').notNull().default(1), // 1 = monthly, 12 = yearly
  accountId: integer('account_id'), // FK → accounts.id
  categoryId: integer('category_id'), // FK → categories.id
  amount: real('amount').notNull(), // POSITIVE magnitude; sweep negates
  currency: text('currency'), // null/'THB' = plain THB; 'USD' = FX rule
  rate: real('rate'), // null = live ECB+fee at the due date; set = pinned
  totalCount: integer('total_count'), // null = subscription; 12 = installment
  startSeq: integer('start_seq').notNull().default(1), // "next is #4" → 4
  startDate: text('start_date').notNull(), // YYYY-MM-DD, the first due date (pre-clamped)
  lastPosted: text('last_posted'), // YYYY-MM-DD; null = never posted
  archived: integer('archived').notNull().default(0),
});

export type Recurrence = typeof recurrences.$inferSelect;
export type NewRecurrence = typeof recurrences.$inferInsert;

// Ensures the FK tables alongside recurrences, so calling this alone yields a queryable rule —
// the same invariant ensureEntriesTable provides.
export async function ensureRecurrencesTable(db: Db): Promise<void> {
  await ensureCategoriesTable(db);
  await ensureAccountsTable(db);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS recurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      day INTEGER NOT NULL,
      interval_months INTEGER NOT NULL DEFAULT 1,
      account_id INTEGER,
      category_id INTEGER,
      amount REAL NOT NULL,
      currency TEXT,
      rate REAL,
      total_count INTEGER,
      start_seq INTEGER NOT NULL DEFAULT 1,
      start_date TEXT NOT NULL,
      last_posted TEXT,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
}
