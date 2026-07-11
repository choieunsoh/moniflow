import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { migrateCategoryIds } from './migrate';

// Build a DB in the pre-migration ("legacy") shape: entries/budgets keyed by category TEXT, plus a
// category_meta table carrying emoji/hue. This is what a real user's data looks like before upgrade.
function legacyDb() {
  const db = initDb(':memory:');
  db.run(sql`CREATE TABLE entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, time TEXT, account TEXT NOT NULL,
    category TEXT NOT NULL, amount REAL NOT NULL, currency TEXT, original_amount REAL, note TEXT,
    source TEXT NOT NULL DEFAULT 'manual')`);
  db.run(
    sql`CREATE TABLE budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, amount REAL NOT NULL)`,
  );
  db.run(
    sql`CREATE TABLE category_meta (category TEXT PRIMARY KEY, emoji TEXT NOT NULL, hue INTEGER)`,
  );
  db.run(sql`INSERT INTO entries (date, account, category, amount) VALUES
    ('2026-07-01','cash','groceries',-100), ('2026-07-02','cash','groceries',-50),
    ('2026-07-03','bank','rent',-9000)`);
  db.run(sql`INSERT INTO category_meta (category, emoji, hue) VALUES ('groceries','🛒',120)`);
  db.run(sql`INSERT INTO budgets (category, amount) VALUES ('groceries', 3000), (NULL, 20000)`);
  return db;
}

describe('migrateCategoryIds', () => {
  it('seeds categories from entries ∪ category_meta, carrying meta emoji/hue', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const cats = db.all(sql`SELECT name, emoji, hue FROM categories ORDER BY name`);
    expect(cats).toEqual([
      { name: 'groceries', emoji: '🛒', hue: 120 },
      { name: 'rent', emoji: '🏷️', hue: null }, // no meta row → fallback emoji
    ]);
  });

  it('backfills entries.category_id by name', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const rows = db.all(sql`SELECT e.category_id = c.id AS ok FROM entries e
      JOIN categories c ON c.name = e.category`);
    expect(rows.every((r) => typeof r === 'object' && r !== null && 'ok' in r && r.ok === 1)).toBe(
      true,
    );
    const nulls = db.all(sql`SELECT id FROM entries WHERE category_id IS NULL`);
    expect(nulls).toHaveLength(0);
  });

  it('backfills budgets.category_id and keeps the total (NULL) row NULL', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const perCat = db.get(sql`SELECT b.category_id = c.id AS ok FROM budgets b
      JOIN categories c ON c.name = b.category WHERE b.category = 'groceries'`);
    const total = db.get(sql`SELECT category_id FROM budgets WHERE category IS NULL`);
    expect(perCat).toMatchObject({ ok: 1 });
    expect(total).toMatchObject({ category_id: null });
  });

  it('is idempotent — a second run changes nothing and does not duplicate categories', () => {
    const db = legacyDb();
    migrateCategoryIds(db);
    const before = db.get(sql`SELECT count(*) AS n FROM categories`);
    migrateCategoryIds(db);
    const after = db.get(sql`SELECT count(*) AS n FROM categories`);
    expect(after).toEqual(before);
  });

  it('is a no-op on a fresh install (no legacy entries table) but still creates categories', () => {
    const db = initDb(':memory:');
    migrateCategoryIds(db);
    expect(() => db.run(sql`INSERT INTO categories (name, emoji) VALUES ('x','🏷️')`)).not.toThrow();
  });
});
