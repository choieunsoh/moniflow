import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { applyColumnMigrations } from './column-migrations';

type ColumnInfoRow = { name: string };
type OffBudgetRow = { off_budget: number };

function hasColumnOf(db: Database.Database): (table: string, column: string) => boolean {
  return (table, column) =>
    db
      .prepare<[], ColumnInfoRow>(`PRAGMA table_info(${table})`)
      .all()
      .some((r) => r.name === column);
}

describe('applyColumnMigrations', () => {
  it('adds off_budget to an old-schema categories/entries db', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT)');
    db.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, amount REAL)');

    applyColumnMigrations(hasColumnOf(db), (ddl) => db.exec(ddl));

    expect(hasColumnOf(db)('categories', 'off_budget')).toBe(true);
    expect(hasColumnOf(db)('entries', 'off_budget')).toBe(true);

    // The column is actually usable, not just present.
    db.exec("INSERT INTO categories (name, off_budget) VALUES ('Fees', 1)");
    const row = db.prepare<[], OffBudgetRow>('SELECT off_budget FROM categories').get();
    expect(row?.off_budget).toBe(1);
  });

  it('is idempotent — running twice does not throw', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT)');
    db.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, amount REAL)');

    applyColumnMigrations(hasColumnOf(db), (ddl) => db.exec(ddl));
    expect(() => applyColumnMigrations(hasColumnOf(db), (ddl) => db.exec(ddl))).not.toThrow();
  });

  it('skips ALTER on a fresh db that already has the columns', () => {
    const db = new Database(':memory:');
    db.exec(
      'CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT, off_budget INTEGER NOT NULL DEFAULT 0)',
    );
    db.exec('CREATE TABLE entries (id INTEGER PRIMARY KEY, amount REAL, off_budget INTEGER)');

    let runCount = 0;
    applyColumnMigrations(hasColumnOf(db), () => {
      runCount += 1;
    });

    expect(runCount).toBe(0);
  });
});
