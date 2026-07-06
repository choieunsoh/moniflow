import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// Shared infrastructure: the SQLite connection only. Deliberately schema-agnostic — features
// own their own tables (src/features/*/schema.ts) and pass them to the query builder. Keeping
// this free of any feature import means the dependency arrow only ever points features → db,
// never back.
export type Db = BetterSQLite3Database;

export function initDb(path = process.env.MONIFLOW_DB ?? 'data/moniflow.db'): Db {
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('busy_timeout = 5000');
  return drizzle(client);
}
