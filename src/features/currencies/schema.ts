import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// The currency catalog. Replaces the hardcoded CURRENCIES const so a code can be added from the
// phone mid-trip — the failure this fixes is landing somewhere unplanned and having to type a
// foreign amount into a THB field, which is how every historical FX defect in this ledger started.
//
// `code` is the ISO 4217 string ('JPY'); it is the primary key, so a currency is referenced by code
// everywhere and there is no surrogate id to resolve. No `symbol` column on purpose — Intl derives
// the glyph from the code (see shared/money.ts currencySymbol); storing it would duplicate data the
// platform already has.
//
// off_budget: 1 = spending in this currency means "I am abroad", so it is excluded from budget
// meters/pace (see entries/off-budget.ts). USD/EUR/GBP stay 0 — in this ledger they are online
// purchases (a Claude subscription), which are ordinary budgeted spend.
export const currencies = sqliteTable('currencies', {
  code: text('code').primaryKey(),
  offBudget: integer('off_budget').notNull().default(0),
  sortOrder: integer('sort_order'),
  archived: integer('archived').notNull().default(0),
});

export type CurrencyRow = typeof currencies.$inferSelect;
export type NewCurrencyRow = typeof currencies.$inferInsert;

export async function ensureCurrenciesTable(db: Db): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS currencies (
      code TEXT PRIMARY KEY,
      off_budget INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
}
