import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  DEFAULT_ACCENT,
  ACCENT_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from '@features/settings/theme';
import { FONT_SCALE_PCT, FONT_SCALE_STORAGE_KEY } from '@features/settings/queries';

// The pre-paint inline script in layout.tsx runs before any bundle loads, so it CANNOT import a
// module: the storage keys, the accent names and the font-scale percent map are all inlined
// literals. Nothing in the toolchain checks them — the script is an opaque string to TypeScript,
// ESLint, vitest and `next build` alike, so a drift here fails no gate and shows up only as a wrong
// theme flashing on a real device.
//
// theme.test.ts already pins the two storage keys. This pins the two LISTS, which is where a drift
// is most likely: adding a tenth accent or changing a font-scale preset means editing two places.
const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'layout.tsx'),
  'utf-8',
);

// Everything between `__html:` and the closing `,\n          }}` — the concatenated string literal.
function inlineScript(): string {
  const start = source.indexOf('__html:');
  expect(start, 'layout.tsx no longer has an __html inline script').toBeGreaterThan(-1);
  const end = source.indexOf('}}', start);
  return source.slice(start, end);
}

describe('the pre-paint inline script mirrors its modules', () => {
  const script = inlineScript();

  it('inlines both storage keys', () => {
    expect(script).toContain(`'${THEME_STORAGE_KEY}'`);
    expect(script).toContain(`'${ACCENT_STORAGE_KEY}'`);
    expect(script).toContain(`'${FONT_SCALE_STORAGE_KEY}'`);
  });

  // The default is deliberately absent from the list: it stamps no attribute, so the script must
  // never match it. Every OTHER accent must be there, or that palette silently fails to survive a
  // reload while every test stays green.
  it.each(ACCENTS.filter((a) => a !== DEFAULT_ACCENT))('inlines the %s accent', (accent) => {
    expect(script).toContain(`'${accent}'`);
  });

  it('excludes the default accent, which must stamp nothing', () => {
    expect(script).toContain(`!=='${DEFAULT_ACCENT}'`);
  });

  it('inlines no accent name the module does not define', () => {
    const listed = [...script.matchAll(/'([a-z]+)'/g)]
      .map((m) => m[1])
      .filter((name) => ACCENTS.some((a) => a === name));
    for (const name of listed) expect(ACCENTS).toContain(name);
  });

  it.each(Object.entries(FONT_SCALE_PCT))('inlines the %s font scale as %s', (key, pct) => {
    expect(script).toContain(`${key}:'${pct}'`);
  });
});
