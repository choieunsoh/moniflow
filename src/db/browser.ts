import { drizzle } from 'drizzle-orm/sqlite-proxy';
import type { Db } from './client';
import { DbWorkerRpc } from './rpc';

let cached: Promise<Db> | null = null;

// Browser entry point: the same sqlite-proxy driver as the Node shim, backed by the worker. Requests
// persistent storage so Chrome/Android does not evict the OPFS DB. Memoizes the init PROMISE (not the
// resolved db) so concurrent first-callers — e.g. the app-shell + a page hook mounting together, or a
// StrictMode double-mount — share ONE worker. Two workers would each try to grab the OPFS SAHPool's
// exclusive access handle and one would throw NoModificationAllowedError.
// A FAILED init must not be memoised. The cache exists to keep concurrent first-callers on one
// worker, but caching a rejection made the first failure permanent: a tab that lost the OPFS lock
// race could never recover, not even after the tab holding it closed, because every later call got
// the same dead promise back. Evicting on failure is what makes a retry mean anything.
export function getBrowserDb(): Promise<Db> {
  if (cached === null) {
    const attempt = createBrowserDb();
    cached = attempt;
    // Guarded by identity so a slow failure can't evict a newer, successful attempt.
    attempt.catch(() => {
      if (cached === attempt) cached = null;
    });
  }
  return cached;
}

async function createBrowserDb(): Promise<Db> {
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    await navigator.storage.persist();
  }
  const rpc = new DbWorkerRpc();
  try {
    await rpc.send({ type: 'ready' }); // force worker boot + table bootstrap before first query
  } catch (err) {
    rpc.close(); // don't leave a dead worker holding OPFS state the retry needs
    throw err;
  }

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
