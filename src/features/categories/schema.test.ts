import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
import { ensureCategoriesTable, categories } from './schema';

describe('ensureCategoriesTable', () => {
  it('creates an empty categories table with an id PK and unique name', async () => {
    const db = makeNodeProxyDb();
    await ensureCategoriesTable(db);
    await db.insert(categories).values({ name: 'groceries', emoji: '🛒' }).run();
    const rows = await db.select().from(categories).all();
    expect(rows).toEqual([
      {
        id: 1,
        name: 'groceries',
        emoji: '🛒',
        hue: null,
        sortOrder: null,
        archived: 0,
        offBudget: 0,
      },
    ]);
    // name is UNIQUE — a duplicate insert throws
    await expect(
      db.insert(categories).values({ name: 'groceries', emoji: '🍔' }).run(),
    ).rejects.toThrow();
    // archived defaults to 0 via the raw bootstrap
    await db.run(sql`INSERT INTO categories (name, emoji) VALUES ('rent', '🏠')`);
    const rent = await db
      .select()
      .from(categories)
      .where(sql`name = 'rent'`)
      .get();
    expect(rent?.archived).toBe(0);
  });
});
