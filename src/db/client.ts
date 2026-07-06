import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

// ponytail: scaffold uses CREATE TABLE IF NOT EXISTS instead of a drizzle-kit migration runner.
// Upgrade path when the schema stops being trivial: generate committed migrations with
// `npm run db:generate` and replay them here via drizzle's migrate(), like portfolio-dashboard.
export function initDb(path = process.env.MONIFLOW_DB ?? 'data/moniflow.db'): Db {
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('busy_timeout = 5000');
  const db = drizzle(client, { schema });
  db.run(sql`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      account TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT
    )
  `);
  return db;
}
