import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// First-class accounts. Each account is a real row with a surrogate `id` PK — entries reference it by
// `account_id`, so a rename touches one row and identity survives edits. `name` is the display string
// (UNIQUE). `icon` is an icon KEY (e.g. 'cash' | 'card' | 'visa' | 'mastercard' | 'jcb' | 'unionpay' |
// 'amex' | 'qr') resolved to a bundled brand SVG by AccountGlyph — NOT a free emoji char (the deliberate
// divergence from categories). `hue` (null = auto, name-derived) tints the account disc/chips. `sort_order`
// + `archived` ride along inert (parity with categories) for a later slice. This file is the schema
// source of truth; drizzle.config globs it.
export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  icon: text('icon').notNull(),
  hue: integer('hue'),
  sortOrder: integer('sort_order'),
  archived: integer('archived').notNull().default(0),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export async function ensureAccountsTable(db: Db): Promise<void> {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      hue INTEGER,
      sort_order INTEGER,
      archived INTEGER NOT NULL DEFAULT 0
    )
  `);
}
