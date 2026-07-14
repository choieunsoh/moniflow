import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

// The single public database type. Both backends (browser worker, node shim) are sqlite-proxy
// drivers, so features depend only on this — never on a concrete engine. The browser entry point is
// src/db/browser.ts (getBrowserDb()); tests + CLI use makeNodeProxyDb() re-exported here.
export type Db = SqliteRemoteDatabase<Record<string, never>>;

export { makeNodeProxyDb } from './node-proxy';
