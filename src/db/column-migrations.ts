// CREATE TABLE IF NOT EXISTS never alters an existing table, so a persisted OPFS db from before a
// column was added won't have it. These ALTERs add missing columns idempotently (skipped when the
// column already exists — fresh dbs already have them from BOOTSTRAP_SQL). ponytail: append-only list;
// each new column ships here + in schema.ts + worker.ts BOOTSTRAP_SQL.
export type ColumnMigration = { table: string; column: string; ddl: string };

export const COLUMN_MIGRATIONS: ColumnMigration[] = [
  {
    table: 'categories',
    column: 'off_budget',
    ddl: 'ALTER TABLE categories ADD COLUMN off_budget INTEGER NOT NULL DEFAULT 0',
  },
  {
    table: 'entries',
    column: 'off_budget',
    ddl: 'ALTER TABLE entries ADD COLUMN off_budget INTEGER',
  },
];

// Apply each migration whose column is missing. `hasColumn` probes the live schema; `run` executes DDL.
// Pure over its two callbacks so it can run against the sqlite-wasm worker AND be unit-tested against
// better-sqlite3.
export function applyColumnMigrations(
  hasColumn: (table: string, column: string) => boolean,
  run: (ddl: string) => void,
): void {
  for (const m of COLUMN_MIGRATIONS) {
    if (!hasColumn(m.table, m.column)) run(m.ddl);
  }
}
