import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureCategoriesTable, categories } from './schema';

describe('ensureCategoriesTable', () => {
  it('creates an empty categories table with an id PK and unique name', () => {
    const db = initDb(':memory:');
    ensureCategoriesTable(db);
    db.insert(categories).values({ name: 'groceries', emoji: '🛒' }).run();
    const rows = db.select().from(categories).all();
    expect(rows).toEqual([
      { id: 1, name: 'groceries', emoji: '🛒', hue: null, sortOrder: null, archived: 0 },
    ]);
    // name is UNIQUE — a duplicate insert throws
    expect(() => db.insert(categories).values({ name: 'groceries', emoji: '🍔' }).run()).toThrow();
    // archived defaults to 0 via the raw bootstrap
    db.run(sql`INSERT INTO categories (name, emoji) VALUES ('rent', '🏠')`);
    const rent = db
      .select()
      .from(categories)
      .where(sql`name = 'rent'`)
      .get();
    expect(rent?.archived).toBe(0);
  });
});
