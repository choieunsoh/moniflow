import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// sqlite3 is self-hosted (not bundled) so Turbopack never touches @sqlite.org/sqlite-wasm's
// index.mjs at build time (it contains a `new Worker(new URL('sqlite3-worker1.mjs', import.meta.url))`
// factory that Turbopack can't statically bundle). The worker loads these at runtime via a
// turbopackIgnore'd dynamic import, so Turbopack never parses the file. index.mjs is the
// "bundler friendly" OO1 build (default export `sqlite3InitModule`) — NOT sqlite3-worker1.mjs,
// which we never load.
const pkg = dirname(fileURLToPath(import.meta.resolve('@sqlite.org/sqlite-wasm/package.json')));
const out = join(process.cwd(), 'public', 'sqlite3');
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, 'dist', 'index.mjs'), join(out, 'sqlite3.mjs'));
copyFileSync(join(pkg, 'dist', 'sqlite3.wasm'), join(out, 'sqlite3.wasm'));
console.log('copied sqlite3 dist -> public/sqlite3/');
