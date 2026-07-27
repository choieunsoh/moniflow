import { describe, expect, it } from 'vitest';
import { BUILD_PLACEHOLDER, stampServiceWorker } from './stamp-sw';

// The whole update mechanism rests on one property: the deployed sw.js must differ, BYTE FOR BYTE,
// between releases. A browser installs a new service worker only when the file's bytes change, and
// public/sw.js shipped unchanged from its first commit — which is why an installed PWA went on
// running a bundle three releases old while every deploy reported success.
const SOURCE = `const CACHE = 'moniflow-${BUILD_PLACEHOLDER}';\nself.addEventListener('install', () => {});\n`;

describe('stampServiceWorker', () => {
  it('puts the version where the placeholder was', () => {
    expect(stampServiceWorker(SOURCE, '1.7.6')).toContain("const CACHE = 'moniflow-1.7.6'");
    expect(stampServiceWorker(SOURCE, '1.7.6')).not.toContain(BUILD_PLACEHOLDER);
  });

  it('yields different bytes for different versions — the property the whole mechanism rests on', () => {
    expect(stampServiceWorker(SOURCE, '1.7.6')).not.toBe(stampServiceWorker(SOURCE, '1.7.7'));
  });

  it('leaves the rest of the worker alone', () => {
    expect(stampServiceWorker(SOURCE, '1.7.6')).toContain("self.addEventListener('install'");
  });

  // A silent no-op here would be the original bug back again: every deploy shipping identical bytes,
  // every install stuck on whatever it first cached, and nothing anywhere reporting a problem.
  it('refuses to pass a worker that has no placeholder to replace', () => {
    expect(() => stampServiceWorker("const CACHE = 'moniflow-v1';", '1.7.6')).toThrow(
      /placeholder/i,
    );
  });
});
