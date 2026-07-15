import type { NextConfig } from 'next';

// Static export: the app is fully client-rendered and its data lives in the browser (OPFS/WASM SQLite),
// so there is no server to render, no DB to reach, and no middleware to run. `next build` emits a static
// `out/` that any static host serves. No serverExternalPackages: better-sqlite3 is only reached through
// type-only imports of @db/client in the browser graph (the makeNodeProxyDb runtime path is tests only).
const config: NextConfig = {
  output: 'export',
};

export default config;
