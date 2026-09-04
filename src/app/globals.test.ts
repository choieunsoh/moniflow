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

// A theme, as this file means it: which half of a light-dark() pair to read. Not the user-facing
// preference (which has a third state, 'system') — that one lives in features/settings/theme.ts and
// resolves to one of these two before any colour is chosen.
type Theme = 'light' | 'dark';
const THEMES: readonly Theme[] = ['light', 'dark'];

// Every colour in globals.css is declared once as `light-dark(<light>, <dark>)`, so a token has two
// values and every assertion below runs twice. A token declared as a bare hex is the same in both
// themes, which is exactly what the browser does with it, so it is returned for either.
//
// `scope` is the CSS text to search: the whole file for the base palette, or a single
// `[data-accent]` block for a palette. Searching the whole file for an accent-owned token would
// return whichever declaration appears first rather than the one that wins.
function token(name: string, theme: Theme, scope: string = css, depth: number = 0): string {
  if (depth > 4) throw new Error(`--${name} indirects more than four levels; likely a cycle`);

  const pair = new RegExp(
    `--${name}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{6})\\s*,\\s*(#[0-9a-fA-F]{6})\\s*\\)`,
  ).exec(scope);
  if (pair !== null) return theme === 'light' ? pair[1] : pair[2];

  // A Tailwind-facing token may indirect through a raw one: `--color-action: var(--action)`. The
  // raw name is what a [data-accent] block overrides, and the @theme name is what components
  // consume, so an assertion should be able to name either and get the same answer. Following the
  // link here is also what makes a typo'd `var(--acton)` fail loudly: a custom property that
  // resolves to nothing changes a colour on screen without failing a single test.
  const indirect = new RegExp(`--${name}:\\s*var\\(--([a-z0-9-]+)\\)`).exec(scope);
  if (indirect !== null) return token(indirect[1], theme, scope, depth + 1);

  const single = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(scope);
  if (single !== null) return single[1];

  throw new Error(`token --${name} not found in globals.css as a hex or a light-dark() hex pair`);
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

describe.each(THEMES)('%s theme', (theme) => {
  describe('text contrast', () => {
    it.each([
      ['color-text', 'color-bg', 4.5],
      ['color-text', 'color-surface', 4.5],
      ['color-muted', 'color-bg', 4.5],
      ['color-muted', 'color-surface', 4.5],
      ['color-faint', 'color-surface-2', 4.5],
      ['color-on-action', 'color-action', 4.5],
      ['color-on-action', 'color-action-hover', 4.5],
      ['color-gain', 'color-surface', 4.5],
      ['color-loss', 'color-surface', 4.5],
      ['color-warn', 'color-surface', 4.5],
      ['color-gain', 'color-bg', 4.5],
      ['color-loss', 'color-bg', 4.5],
      ['color-warn', 'color-bg', 4.5],
    ])('%s on %s clears AA', (ink, ground, floor) => {
      expect(contrast(token(ink, theme), token(ground, theme))).toBeGreaterThanOrEqual(floor);
    });
  });

  describe('non-text contrast', () => {
    // WCAG 2.2 SC 1.4.11: a UI boundary or indicator that carries meaning needs 3:1.
    it.each([
      ['color-focus-ring', 'color-surface'],
      ['color-focus-ring', 'color-bg'],
      ['color-action', 'color-bg'],
    ])('%s clears 3:1 on %s', (mark, ground) => {
      expect(contrast(token(mark, theme), token(ground, theme))).toBeGreaterThanOrEqual(3);
    });

    // The decorative edge is deliberately quieter than 3:1: a panel is already delimited by its own
    // surface lightness, and a blanket 3:1 outlines every card. It must still be visible, which the
    // measured 1.29:1 of the previous palette was not.
    it('the decorative border is visible without outlining every card', () => {
      const ratio = contrast(token('color-border', theme), token('color-surface', theme));
      expect(ratio).toBeGreaterThanOrEqual(2);
      expect(ratio).toBeLessThan(3);
    });

    // A ceiling, not just a floor — and the ceiling is what catches a TRANSPOSED pair. This boundary
    // means "tap here" (inputs, keys, dividers, chrome); it is not meant to be maximal, or it would
    // simply be text-coloured. Both halves clear 3:1 against either ground, so a floor-only check
    // passed even with the two halves reversed: 3.26/3.07 when correct, 5.71/5.38 when swapped.
    it('the strong border is a boundary, not a maximal edge', () => {
      const ratio = contrast(token('color-border-strong', theme), token('color-surface', theme));
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(ratio).toBeLessThan(4.5);
    });
  });

  describe('hue separation', () => {
    const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

    it.each(['color-gain', 'color-loss'])('no category colour impersonates --%s', (name) => {
      const reserved = hue(token(name, theme));
      for (const slice of SLICE_COLORS) {
        expect(apart(hue(slice), reserved)).toBeGreaterThan(25);
      }
    });
  });
});

// Every assertion above measures a contrast RATIO, and a ratio is symmetric. So if token() returned
// the wrong half of every pair, or a single pair were typed light-dark(<dark>, <light>) by mistake,
// every floor would still be met and the suite would stay green while the app rendered inverted.
// These are the only assertions that say WHICH half is which.
describe('theme direction', () => {
  it.each(['color-backdrop', 'color-bg', 'color-surface', 'color-surface-2'])(
    '--%s is lighter in the light theme',
    (name) => {
      expect(luminance(token(name, 'light'))).toBeGreaterThan(luminance(token(name, 'dark')));
    },
  );

  it.each(['color-text', 'color-muted', 'color-faint'])(
    '--%s is darker in the light theme',
    (name) => {
      expect(luminance(token(name, 'light'))).toBeLessThan(luminance(token(name, 'dark')));
    },
  );

  // The action is the maximum-contrast object on the page, so it inverts with the ground rather
  // than following it: near-black on a light page, near-white on a dark one.
  it('the action inverts against the ground', () => {
    expect(luminance(token('color-action', 'light'))).toBeLessThan(
      luminance(token('color-action', 'dark')),
    );
  });
});

describe('the accent axis stays in its lane', () => {
  // The six-meanings problem this palette was built to fix came from ONE colour meaning action,
  // location, selection, links, operators and every Save button at once. The user-chosen accent is
  // allowed to tint the action and the selection — they were already the same colour at different
  // intensities — but the tokens below are what carried the other four meanings, and their return
  // is how the problem comes back.
  it.each([
    'color-accent',
    'color-accent-hover',
    'color-accent-text',
    'color-accent-soft',
    'color-accent-ring',
  ])('--%s stays gone', (name) => {
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

// Each palette's declarations, isolated. Searching the whole file for an accent-owned token would
// return :root's copy rather than the block's, so every accent assertion scopes to its own block.
function accentBlock(name: string): string {
  const match = new RegExp(`\\[data-accent='${name}'\\]\\s*\\{([^}]*)\\}`).exec(css);
  if (match === null) throw new Error(`no [data-accent='${name}'] block in globals.css`);
  return match[1];
}

const ACCENT_NAMES = [
  'ink',
  'indigo',
  'violet',
  'plum',
  'rose',
  'clay',
  'olive',
  'teal',
  'azure',
] as const;

describe.each(ACCENT_NAMES)('accent %s', (accent) => {
  const block = accentBlock(accent);

  describe.each(THEMES)('%s theme', (theme) => {
    // Only the accent-owned pairs. Everything else is theme-owned and already checked above;
    // re-checking it per palette would assert nine times that :root did not change.
    it('ink on the action fill clears AA', () => {
      expect(
        contrast(token('on-action', theme, block), token('action', theme, block)),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('ink on the hover fill clears AA', () => {
      expect(
        contrast(token('on-action', theme, block), token('action-hover', theme, block)),
      ).toBeGreaterThanOrEqual(4.5);
    });

    it('the action reads as an object against the ground', () => {
      expect(
        contrast(token('action', theme, block), token('color-bg', theme)),
      ).toBeGreaterThanOrEqual(3);
    });

    // The selected state is --action composited over the surface at the alpha :root declares. This
    // is the check whose absence let a 1.02:1 selected tile ship: the hex-only token() could not
    // read an rgba() value, so the lift was never measured at all.
    //
    // 1.25:1 is a floor for MEASURABLE, not for sufficient. A selected state must also carry a
    // border or a tick — see the note on --color-selected in globals.css.
    it('the selected lift is measurable against both surfaces', () => {
      const alpha = theme === 'light' ? 0.14 : 0.12;
      for (const ground of ['color-surface', 'color-surface-2']) {
        const base = token(ground, theme);
        const lifted = composite(token('action', theme, block), base, alpha);
        expect(contrast(lifted, base)).toBeGreaterThanOrEqual(1.25);
      }
    });
  });
});

// Simple alpha-over-opaque compositing, which is what the browser does with a color-mix() against
// `transparent` painted on an opaque ground.
function composite(fg: string, bg: string, alpha: number): string {
  const mixed = channels(fg).map((c, i) => Math.round(alpha * c + (1 - alpha) * channels(bg)[i]));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

describe('accent palette structure', () => {
  // 'ink' duplicates :root so the picker can show it while another palette is live. Two copies of a
  // value are two values that drift, so they are pinned equal rather than trusted.
  it('pins [data-accent=ink] equal to the bare :root it duplicates', () => {
    const ink = accentBlock('ink');
    for (const name of ['action', 'on-action', 'action-hover']) {
      for (const theme of THEMES) {
        expect(token(name, theme, ink), `ink's --${name} (${theme})`).toBe(token(name, theme));
      }
    }
  });

  // A red that changes when the user picks a colour is a red that means nothing, and giving red a
  // meaning is what the previous palette slice spent its effort on.
  it.each(ACCENT_NAMES)('%s does not move a status colour', (accent) => {
    const block = accentBlock(accent);
    for (const name of ['--color-gain', '--color-loss', '--color-warn']) {
      expect(block, `${accent} must not declare ${name}`).not.toContain(`${name}:`);
    }
  });

  // Every name the picker offers must have a block, or that swatch silently paints the current
  // accent instead of the one it advertises.
  it('has a block for every accent the picker offers', () => {
    for (const name of ACCENT_NAMES) expect(() => accentBlock(name)).not.toThrow();
  });
});
