import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureAccountsTable, accounts } from './schema';

describe('ensureAccountsTable', () => {
  it('creates an accounts table with an id PK, unique name, and defaults', () => {
    const db = initDb(':memory:');
    ensureAccountsTable(db);
    db.insert(accounts).values({ name: 'Cash', icon: 'cash' }).run();
    const rows = db.select().from(accounts).all();
    expect(rows).toEqual([
      { id: 1, name: 'Cash', icon: 'cash', hue: null, sortOrder: null, archived: 0 },
    ]);
    expect(() => db.insert(accounts).values({ name: 'Cash', icon: 'card' }).run()).toThrow();
    db.run(sql`INSERT INTO accounts (name, icon) VALUES ('Bank', 'card')`);
    const bank = db
      .select()
      .from(accounts)
      .where(sql`name = 'Bank'`)
      .get();
    expect(bank?.archived).toBe(0);
  });

  it('is idempotent — a second ensure keeps existing rows', () => {
    const db = initDb(':memory:');
    ensureAccountsTable(db);
    db.insert(accounts).values({ name: 'Cash', icon: 'cash' }).run();
    ensureAccountsTable(db);
    expect(db.select().from(accounts).all()).toHaveLength(1);
  });
});
