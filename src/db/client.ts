import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

// Shared infrastructure: the SQLite connection only. Deliberately schema-agnostic — features
// own their own tables (src/features/*/schema.ts) and pass them to the query builder. Keeping
// this free of any feature import means the dependency arrow only ever points features → db,
// never back.
export type Db = BetterSQLite3Database;

// On Vercel the filesystem is read-only except /tmp, so default there to an ephemeral /tmp DB (data
// does NOT persist across cold starts — fine for a demo, not for real use; see the SQLite→hosted-DB
// migration note). Locally it stays data/moniflow.db. MONIFLOW_DB overrides either way.
const defaultDbPath =
  process.env.MONIFLOW_DB || (process.env.VERCEL ? '/tmp/moniflow.db' : 'data/moniflow.db');

export function initDb(path = defaultDbPath): Db {
  // better-sqlite3 creates the DB file but NOT its parent dir — a fresh checkout has no data/.
  // Ensure it exists so the first run (CLI or dashboard) works without a manual mkdir.
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('busy_timeout = 5000');
  return drizzle(client);
}
