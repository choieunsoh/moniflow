import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

// Single source of truth for the schema. After any edit here, re-run `npm run db:generate`
// to regenerate the committed migration under drizzle/migrations/.
//
// `entries` — the money-flow ledger: one row per inflow/outflow. amount is signed
// (+ inflow, - outflow), in THB. Derived totals (balances, category rollups) are computed
// in queries, never stored.
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
