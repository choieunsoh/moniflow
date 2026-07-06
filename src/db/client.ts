import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// Shared infrastructure: the SQLite connection only. Deliberately schema-agnostic — features
// own their own tables (src/features/*/schema.ts) and pass them to the query builder. Keeping
// this free of any feature import means the dependency arrow only ever points features → db,
// never back.
export type Db = BetterSQLite3Database;

export function initDb(path = process.env.MONIFLOW_DB ?? 'data/moniflow.db'): Db {
  // better-sqlite3 creates the DB file but NOT its parent dir — a fresh checkout has no data/.
  // Ensure it exists so the first run (CLI or dashboard) works without a manual mkdir.
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('busy_timeout = 5000');
  return drizzle(client);
}
