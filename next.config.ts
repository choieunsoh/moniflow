import { readFileSync } from 'node:fs';
import type { NextConfig } from 'next';

// Static export: the app is fully client-rendered and its data lives in the browser (OPFS/WASM SQLite),
// so there is no server to render, no DB to reach, and no middleware to run. `next build` emits a static
// `out/` that any static host serves. No serverExternalPackages: better-sqlite3 is only reached through
// type-only imports of @db/client in the browser graph (the makeNodeProxyDb runtime path is tests only).
// The running app has no other way to know which release it is — there is no server to ask and no
// manifest it can read at runtime. Inlined at build time so About can state it, which is what makes
// "am I actually on the new version?" answerable on the phone instead of a guess. readFileSync rather
// than an import, so the config needs no resolveJsonModule.
const pkg: unknown = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version =
  typeof pkg === 'object' && pkg !== null && 'version' in pkg && typeof pkg.version === 'string'
    ? pkg.version
    : '0.0.0';

const config: NextConfig = {
  output: 'export',
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Since 16.4, `next dev` writes a generic AGENTS.md whenever it detects an AI agent and restores it
  // if deleted. Project rules for agents live in CLAUDE.md; this keeps the tree free of the duplicate.
  agentRules: false,
};

export default config;
