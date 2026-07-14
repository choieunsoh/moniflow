import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
import { ensureAccountsTable, accounts } from './schema';

describe('ensureAccountsTable', () => {
  it('creates an accounts table with an id PK, unique name, and defaults', async () => {
    const db = makeNodeProxyDb();
    await ensureAccountsTable(db);
    await db.insert(accounts).values({ name: 'Cash', icon: 'cash' }).run();
    const rows = await db.select().from(accounts).all();
    expect(rows).toEqual([
      { id: 1, name: 'Cash', icon: 'cash', hue: null, sortOrder: null, archived: 0 },
    ]);
    await expect(
      db.insert(accounts).values({ name: 'Cash', icon: 'card' }).run(),
    ).rejects.toThrow();
    await db.run(sql`INSERT INTO accounts (name, icon) VALUES ('Bank', 'card')`);
    const bank = await db
      .select()
      .from(accounts)
      .where(sql`name = 'Bank'`)
      .get();
    expect(bank?.archived).toBe(0);
  });

  it('is idempotent — a second ensure keeps existing rows', async () => {
    const db = makeNodeProxyDb();
    await ensureAccountsTable(db);
    await db.insert(accounts).values({ name: 'Cash', icon: 'cash' }).run();
    await ensureAccountsTable(db);
    expect(await db.select().from(accounts).all()).toHaveLength(1);
  });
});
