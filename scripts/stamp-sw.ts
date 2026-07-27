import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates public/sw.js from scripts/sw.template.js, stamped with the release version. Runs from
// predev:web / prebuild:web — the same generated-into-public pattern as copy-sqlite3.mjs, and
// public/sw.js is gitignored for the same reason.
//
// WHY THIS EXISTS: a browser installs a new service worker only when /sw.js differs byte for byte
// from the one it already has. sw.js was a static file that had not changed since the commit that
// introduced it, so every deploy shipped identical bytes, no install ever saw an update, and an
// installed PWA happily ran a bundle several releases old while each deploy reported success. Three
// fixes shipped to production without ever reaching the phone that way.
//
// WHY PRE-BUILD AND NOT POST: the first attempt stamped out/sw.js afterwards, which works locally
// and silently does nothing on Vercel — its builder collects the static output during `next build`
// (visible as "Running onBuildComplete from Vercel" BEFORE the postbuild line in the log), so the
// stamp landed on a copy that had already been left behind. The generated file has to exist before
// next build copies public/ into the output.
export const BUILD_PLACEHOLDER = '__BUILD__';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function stampServiceWorker(source: string, version: string): string {
  if (!source.includes(BUILD_PLACEHOLDER)) {
    throw new Error(
      `sw.js contains no ${BUILD_PLACEHOLDER} placeholder to replace — the deployed worker would be ` +
        'byte-identical to the last release and no installed PWA would ever update.',
    );
  }
  return source.replaceAll(BUILD_PLACEHOLDER, version);
}

function readVersion(): string {
  const parsed: unknown = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null || !('version' in parsed)) {
    throw new Error('package.json has no version');
  }
  const { version } = parsed;
  if (typeof version !== 'string') throw new Error('package.json version is not a string');
  return version;
}

function main(): void {
  const version = readVersion();
  const template = readFileSync(resolve(rootDir, 'scripts', 'sw.template.js'), 'utf-8');
  writeFileSync(resolve(rootDir, 'public', 'sw.js'), stampServiceWorker(template, version));
  process.stdout.write(`generated public/sw.js -> moniflow-${version}\n`);
}

const currentModulePath = fileURLToPath(import.meta.url);
const currentScriptPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (currentScriptPath && currentModulePath === currentScriptPath) {
  main();
}
