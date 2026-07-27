import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stamps the built service worker with the release version, as a postbuild step.
//
// WHY THIS EXISTS: a browser installs a new service worker only when /sw.js differs byte for byte
// from the one it already has. public/sw.js is a static file that had not changed since the commit
// that introduced it, so every deploy shipped identical bytes, no install ever saw an update, and an
// installed PWA happily ran a bundle several releases old while each deploy reported success. Three
// fixes shipped to production without ever reaching the phone that way.
//
// The placeholder stays in the CHECKED-IN file and the version is substituted into out/ only, so the
// repo never carries a build artefact and `git status` stays clean across releases. In dev the
// literal placeholder is served instead, which is harmless — it is only ever a cache name.
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
  // next build copies public/ into out/, so this rewrites the COPY — public/sw.js keeps its
  // placeholder and stays untouched in git.
  const target = resolve(rootDir, 'out', 'sw.js');
  const version = readVersion();
  writeFileSync(target, stampServiceWorker(readFileSync(target, 'utf-8'), version));
  process.stdout.write(`stamped out/sw.js -> moniflow-${version}\n`);
}

const currentModulePath = fileURLToPath(import.meta.url);
const currentScriptPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (currentScriptPath && currentModulePath === currentScriptPath) {
  main();
}
