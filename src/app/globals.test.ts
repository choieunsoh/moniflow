import { globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SLICE_COLORS } from '@features/entries/donut';

// The palette is the one part of the design system that looks untestable and is not. Two properties
// are machine-checkable from the token values themselves, so a future edit that drops a colour below
// AA fails here rather than in someone's eyes six months later.
//
// The colour maths is duplicated from donut.test.ts on purpose, matching how that file keeps its own
// local hueOf: a runtime module would ship this arithmetic into the browser bundle to serve nothing
// but tests.
const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'globals.css'), 'utf-8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (match === null) throw new Error(`token --${name} not found in globals.css`);
  return match[1];
}

function channels(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function hue(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}

describe('text contrast', () => {
  it.each([
    ['color-text', 'color-bg', 4.5],
    ['color-text', 'color-surface', 4.5],
    ['color-muted', 'color-bg', 4.5],
    ['color-muted', 'color-surface', 4.5],
    ['color-faint', 'color-surface-2', 4.5],
    ['color-on-action', 'color-action', 4.5],
  ])('%s on %s clears AA', (ink, ground, floor) => {
    expect(contrast(token(ink), token(ground))).toBeGreaterThanOrEqual(floor);
  });
});

describe('non-text contrast', () => {
  // WCAG 2.2 SC 1.4.11: a UI boundary or indicator that carries meaning needs 3:1.
  it.each([
    ['color-focus-ring', 'color-surface'],
    ['color-focus-ring', 'color-bg'],
    ['color-border-strong', 'color-surface'],
    ['color-action', 'color-bg'],
  ])('%s clears 3:1 on %s', (mark, ground) => {
    expect(contrast(token(mark), token(ground))).toBeGreaterThanOrEqual(3);
  });

  // The decorative edge is deliberately quieter than 3:1: a panel is already delimited by its own
  // surface lightness, and a blanket 3:1 outlines every card. It must still be visible, which the
  // measured 1.29:1 of the previous palette was not.
  it('the decorative border is visible without outlining every card', () => {
    const ratio = contrast(token('color-border'), token('color-surface'));
    expect(ratio).toBeGreaterThanOrEqual(2);
    expect(ratio).toBeLessThan(3);
  });
});

describe('hue separation', () => {
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

  it.each(['color-gain', 'color-loss'])('no category colour impersonates --%s', (name) => {
    const reserved = hue(token(name));
    for (const slice of SLICE_COLORS) {
      expect(apart(hue(slice), reserved)).toBeGreaterThan(25);
    }
  });
});

describe('the accent is gone', () => {
  // The whole point of this slice: one treatment, one meaning. A reintroduced accent token is how
  // the six-meanings problem comes back.
  it.each([
    'color-accent',
    'color-accent-hover',
    'color-accent-text',
    'color-accent-soft',
    'color-accent-ring',
  ])('--%s no longer exists', (name) => {
    expect(css).not.toContain(`--${name}:`);
  });
});

describe('no component references a removed token', () => {
  // Removing a custom property breaks nothing at build time: a component references it as an opaque
  // string, so typecheck, lint, vitest and next build all pass while the colour silently resolves to
  // nothing. This scan is the only mechanical check that the sweep was complete.
  const sources = globSync('src/**/*.{ts,tsx,css}', { exclude: ['**/*.test.*'] });

  it.each([
    'color-accent',
    'color-accent-hover',
    'color-accent-text',
    'color-accent-soft',
    'color-accent-ring',
    'color-on-accent',
  ])('no file still uses var(--%s)', (name) => {
    const offenders = sources.filter((file) =>
      readFileSync(file, 'utf-8').includes(`var(--${name})`),
    );
    expect(offenders).toEqual([]);
  });
});
