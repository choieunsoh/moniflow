import { sqliteTable, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { migrateCategoryIds } from '@db/migrate';
import type { Db } from '@db/client';

// Standing budgets — no cycle column; the same limit applies to every billing cycle. The row with
// category_id IS NULL is the TOTAL (whole-cycle) budget; category_id rows are per-category caps.
// Amounts are positive monthly limits, compared against spend magnitudes.
export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id'), // NULL = the total budget row; else FK → categories.id
  amount: real('amount').notNull(),
});

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

// A read row for the UI: the budget plus the joined category NAME (null for the total row).
export type BudgetReadRow = Budget & { category: string | null };

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap; migrateCategoryIds upgrades an existing text-keyed
// budgets table (adds + backfills category_id) — invoked here so ensuring budgets triggers the backfill.
export function ensureBudgetsTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      amount REAL NOT NULL
    )
  `);
  migrateCategoryIds(db);
}
