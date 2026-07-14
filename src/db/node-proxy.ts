import Database from 'better-sqlite3';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

// Node-side backend for the async sqlite-proxy driver: an in-memory better-sqlite3 database. Used by
// Vitest and the CLI so tests exercise the SAME async driver + row shaping the browser worker
// (src/db/worker.ts) runs. Keep the row shaping identical across both backends.
export function makeNodeProxyDb(): SqliteRemoteDatabase<Record<string, never>> {
  const raw = new Database(':memory:');
  raw.pragma('journal_mode = WAL');

  const one = (query: string, params: unknown[], method: string): { rows: unknown[] } => {
    const stmt = raw.prepare<unknown[], unknown[]>(query);
    if (method === 'run') {
      stmt.run(...params);
      return { rows: [] };
    }
    // sqlite-proxy's query builder maps rows POSITIONALLY (mapResultRow reads row[i]), so the client
    // MUST return each row as an ARRAY of column values via stmt.raw(). Returning objects (stmt.all())
    // breaks every query-builder read and diverges from the browser worker (which also returns arrays).
    const rowsAsArrays = stmt.raw().all(...params);
    // No `?? []` fallback here: drizzle's mapGetResult treats a falsy `rows` as "no row found"
    // (returns undefined). Coalescing a missing row to `[]` (truthy) broke every not-found .get()
    // call — e.g. getEntryById(missingId) returned an all-undefined-fields object instead of
    // undefined, and existence checks (deleteCategory's "used" guard, renameCategory/mergeAccountInto's
    // target lookup) treated "nothing found" as "something found".
    if (method === 'get') return { rows: rowsAsArrays[0] };
    return { rows: rowsAsArrays };
  };

  return drizzle(
    async (query, params, method) => one(query, params, method),
    async (queries: { sql: string; params: unknown[]; method: string }[]) => {
      const run = raw.transaction((qs: { sql: string; params: unknown[]; method: string }[]) =>
        qs.map((q) => one(q.sql, q.params, q.method)),
      );
      return run(queries);
    },
  );
}
