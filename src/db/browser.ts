import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { Db } from './client';
import { DbWorkerRpc } from './rpc';

let cached: Promise<Db> | null = null;

// Browser entry point: the same sqlite-proxy driver as the Node shim, backed by the worker. Requests
// persistent storage so Chrome/Android does not evict the OPFS DB. Memoizes the init PROMISE (not the
// resolved db) so concurrent first-callers — e.g. the app-shell + a page hook mounting together, or a
// StrictMode double-mount — share ONE worker. Two workers would each try to grab the OPFS SAHPool's
// exclusive access handle and one would throw NoModificationAllowedError.
export function getBrowserDb(): Promise<Db> {
  cached ??= createBrowserDb();
  return cached;
}

async function createBrowserDb(): Promise<Db> {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    await navigator.storage.persist();
  }
  const rpc = new DbWorkerRpc();
  await rpc.send({ type: 'ready' }); // force worker boot + table bootstrap before first query

  return drizzle(
    async (sql, params, method) => {
      // res.rows is the array of row-arrays for all/values, or the single row (or undefined) for get —
      // shaped by the worker to match what sqlite-proxy's mapAllResult/mapGetResult expect.
      const res = await rpc.send({ type: 'query', sql, params, method });
      return { rows: res.rows };
    },
    async (queries) => {
      // Each element is already `{ rows }`; return them as-is. drizzle's batch mapper unwraps `.rows`
      // itself (isFromBatch), so mapping to `r.rows` here would double-unwrap and break every batch.
      const res = await rpc.send({ type: 'batch', queries });
      return res.results;
    },
  );
}
