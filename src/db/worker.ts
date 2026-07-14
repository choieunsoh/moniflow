/// <reference lib="webworker" />
import type { Sqlite3Static, Database, BindableValue } from '@sqlite.org/sqlite-wasm';

// drizzle's sqlite-proxy always sends params as a positional array of SQL-bindable values, so the
// worker types them as BindableValue[] (assignable to the oo1 bind()'s BindingSpec) rather than unknown[].
type QueryMsg = { id: number; type: 'query'; sql: string; params: BindableValue[]; method: string };
type BatchMsg = {
  id: number;
  type: 'batch';
  queries: { sql: string; params: BindableValue[]; method: string }[];
};
type ExportMsg = { id: number; type: 'export' };
type ReadyMsg = { id: number; type: 'ready' };
type InMsg = QueryMsg | BatchMsg | ExportMsg | ReadyMsg;

const DB_FILE = '/moniflow.sqlite';
let api: Sqlite3Static | null = null;
let db: Database | null = null;

// ponytail: the six-table DDL is duplicated here (not imported from feature schema.ts) so db/ stays
// feature-free per the dependency rule — the same trade the retired migrate.ts made. Kept in lockstep
// with the ensure*Table CREATEs by the OPFS smoke check (Task 12) + the query tests (Node shim).
const BOOTSTRAP_SQL = [
  `CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
     time TEXT, account_id INTEGER, category_id INTEGER, amount REAL NOT NULL, currency TEXT,
     original_amount REAL, note TEXT, source TEXT NOT NULL DEFAULT 'manual')`,
  `CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
     emoji TEXT NOT NULL, hue INTEGER, sort_order INTEGER, archived INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
     icon TEXT NOT NULL, hue INTEGER, sort_order INTEGER, archived INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, amount REAL NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS trip_titles (id TEXT PRIMARY KEY, title TEXT NOT NULL)`,
];

// Statement with no result set (DDL, INSERT/UPDATE/DELETE, BEGIN/COMMIT/ROLLBACK).
function runStmt(sql: string, params: BindableValue[] = []): void {
  if (db === null) throw new Error('db not ready');
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) stmt.bind(params);
    stmt.step();
  } finally {
    stmt.finalize();
  }
}

// Query returning rows as arrays of column values — the shape sqlite-proxy's positional mapper expects.
// 'get' returns the FIRST row (an array) or undefined when there is no row: drizzle's mapGetResult
// treats a falsy value as "not found" (→ undefined), so a not-found .get() must NOT coalesce to [].
function queryRows(sql: string, params: BindableValue[], method: string): unknown {
  if (method === 'run') {
    runStmt(sql, params);
    return [];
  }
  if (db === null) throw new Error('db not ready');
  const stmt = db.prepare(sql);
  const rows: unknown[] = [];
  try {
    if (params.length > 0) stmt.bind(params);
    while (stmt.step()) rows.push(stmt.get([]));
  } finally {
    stmt.finalize();
  }
  if (method === 'get') return rows[0];
  return rows;
}

// Runtime-load the self-hosted sqlite3 (public/sqlite3/) so Turbopack never bundles the npm package
// (whose index.mjs contains an un-resolvable `new Worker(new URL(...))` factory for the worker1
// promiser, which we never use). turbopackIgnore leaves this import as a runtime URL fetch.
// locateFile points the loader at the .wasm sitting beside the .mjs.
async function boot(): Promise<void> {
  const { default: sqlite3InitModule } = await import(
    /* turbopackIgnore: true */ '/sqlite3/sqlite3.mjs'
  );
  api = await sqlite3InitModule({ locateFile: (file: string) => `/sqlite3/${file}` });
  const pool = await api.installOpfsSAHPoolVfs({ name: 'moniflow-pool' });
  db = new pool.OpfsSAHPoolDb(DB_FILE);
  for (const ddl of BOOTSTRAP_SQL) runStmt(ddl);
}

let bootPromise: Promise<void> | null = null;
function ready(): Promise<void> {
  if (bootPromise === null) bootPromise = boot();
  return bootPromise;
}

self.addEventListener('message', (event: MessageEvent<InMsg>) => {
  const msg = event.data;
  void ready().then(() => {
    try {
      if (msg.type === 'ready') {
        self.postMessage({ id: msg.id, ok: true });
      } else if (msg.type === 'query') {
        self.postMessage({
          id: msg.id,
          ok: true,
          rows: queryRows(msg.sql, msg.params, msg.method),
        });
      } else if (msg.type === 'batch') {
        runStmt('BEGIN');
        try {
          const results = msg.queries.map((q) => ({ rows: queryRows(q.sql, q.params, q.method) }));
          runStmt('COMMIT');
          self.postMessage({ id: msg.id, ok: true, results });
        } catch (err) {
          runStmt('ROLLBACK');
          throw err;
        }
      } else if (msg.type === 'export') {
        if (api === null || db === null) throw new Error('db not ready');
        const bytes = api.capi.sqlite3_js_db_export(db);
        self.postMessage({ id: msg.id, ok: true, bytes }, [bytes.buffer]);
      }
    } catch (err) {
      self.postMessage({ id: msg.id, ok: false, error: String(err) });
    }
  });
});
