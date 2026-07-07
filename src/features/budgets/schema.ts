import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// Standing budgets — no cycle column; the same limit applies to every billing cycle (per-cycle
// overrides are a later slice). The row with category IS NULL is the TOTAL (whole-cycle) budget;
// category rows are per-category caps. Amounts are positive monthly limits — spend is always
// compared as a magnitude, never signed, against these.
export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  category: text('category'), // NULL = the total budget row
  amount: real('amount').notNull(), // positive monthly limit
});

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap, matching the entries feature's scaffold
// pattern. Upgrade to a committed drizzle-kit migration once the schema stops being trivial.
export function ensureBudgetsTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      amount REAL NOT NULL
    )
  `);
}
