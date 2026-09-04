/**
 * Appearance preference, as pure values.
 *
 * Deliberately free of DOM, storage and db access: this module is unit-testable, and the pre-paint
 * inline script in layout.tsx mirrors its logic without importing it (it has to run before any
 * bundle loads). The duplicated constants are the two storage keys; theme.test.ts pins them on this
 * side, and the inline script's copies are called out in a comment there.
 *
 * The two axes never interact. `data-theme` decides which half of every `light-dark()` pair
 * resolves; `data-accent` decides which set of pairs is in play. Each accent declares both halves,
 * so any accent works in either theme and switching one leaves the other alone.
 */

export const THEME_STORAGE_KEY = 'moniflow_theme';
export const ACCENT_STORAGE_KEY = 'moniflow_accent';

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'system';

/**
 * 'ink' is the ORIGINAL palette and is deliberately not stamped onto <html> — it is what the bare
 * `:root` block already declares. Selecting it removes the attribute, exactly as theme 'system'
 * does, so the default costs no CSS and cannot drift from the base tokens.
 *
 * The hues are spread around the wheel at a fixed OKLCH lightness per theme (86% dark, 30% light),
 * which is what lets them sit as little as 3 degrees from a donut slice without being confusable:
 * the donut band is at L 62-66, so the separation is lightness, not hue. See the spec.
 */
export const ACCENTS = [
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
export type Accent = (typeof ACCENTS)[number];
export const DEFAULT_ACCENT: Accent = 'ink';

// Named, not just shown: plum and rose sit 40 degrees apart and violet and plum 30, which a 28px
// dot alone turns into a memory test rather than a choice.
export const ACCENT_LABELS: Record<Accent, string> = {
  ink: 'Ink',
  indigo: 'Indigo',
  violet: 'Violet',
  plum: 'Plum',
  rose: 'Rose',
  clay: 'Clay',
  olive: 'Olive',
  teal: 'Teal',
  azure: 'Azure',
};

export function isTheme(value: unknown): value is Theme {
  // Comparing element by element rather than `THEMES.includes(value)`: `.includes` on a readonly
  // tuple narrows its argument to the tuple's own union, which `value: unknown` is not assignable
  // to — and working around that would need a cast, which this repo bans.
  for (const theme of THEMES) if (theme === value) return true;
  return false;
}

export function isAccent(value: unknown): value is Accent {
  for (const accent of ACCENTS) if (accent === value) return true;
  return false;
}

/** Anything unreadable — absent key, corrupted value, another app's key — means the default. */
export function readTheme(raw: string | null): Theme {
  return isTheme(raw) ? raw : DEFAULT_THEME;
}

export function readAccent(raw: string | null): Accent {
  return isAccent(raw) ? raw : DEFAULT_ACCENT;
}
