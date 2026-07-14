import { describe, expect, it } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { makeNodeProxyDb } from './node-proxy';

const t = sqliteTable('t', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
});

describe('makeNodeProxyDb', () => {
  it('maps query-builder rows to objects via positional array shaping', async () => {
    const db = makeNodeProxyDb();
    await db.run(sql`create table t (id integer primary key autoincrement, name text not null)`);
    await db.insert(t).values([{ name: 'a' }, { name: 'b' }]);

    const all = await db.select().from(t).orderBy(t.id).all();
    expect(all).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);

    const one = await db.select({ name: t.name }).from(t).where(eq(t.id, 2)).get();
    expect(one).toEqual({ name: 'b' });
  });

  it('runs batch as one transaction', async () => {
    const db = makeNodeProxyDb();
    await db.run(sql`create table t (id integer primary key autoincrement, name text not null)`);
    await db.batch([db.insert(t).values({ name: 'x' }), db.insert(t).values({ name: 'y' })]);
    const all = await db.select({ name: t.name }).from(t).orderBy(t.id).all();
    expect(all.map((r) => r.name)).toEqual(['x', 'y']);
  });
});
