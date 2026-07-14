// Deterministic disc tint per category name — a stable hue from a string hash, so each category keeps
// its color across sessions with nothing stored. A stored `hue` (from the picker) overrides the hash;
// both shade functions take it so the pick flows through the existing tint/bold machinery unchanged.
export function categoryHue(name: string): number {
  let hash = 0;
  for (const ch of name) {
    hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  }
  return Math.abs(hash) % 360;
}

// `?? ` (not `||`) so a picked hue of 0 (red) survives — 0 is a valid hue, not "unset".
function resolveHue(name: string, hue?: number | null): number {
  return hue ?? categoryHue(name);
}

// Greyscale discs reuse the same integer `hue` column (no migration): a stored value >= GRAY_BASE is
// "grey at lightness (value - GRAY_BASE)%", so 1000 = black … 1100 = white. Hues stay 0–359.
export const GRAY_BASE = 1000;

function isGray(hue?: number | null): hue is number {
  return typeof hue === 'number' && hue >= GRAY_BASE;
}
function grayLightness(hue: number): number {
  return Math.min(100, Math.max(0, hue - GRAY_BASE));
}

// The soft tint used behind emoji (callers apply it at low alpha).
export function categoryColor(name: string, hue?: number | null): string {
  if (isGray(hue)) return `hsl(0 0% ${grayLightness(hue)}%)`;
  return `hsl(${resolveHue(name, hue)} 60% 55%)`;
}

// A deeper, saturated disc for white line-icons (Monefy look) — lower lightness so white keeps
// contrast across hues. Greys span the full black→white range instead.
export function categoryColorBold(name: string, hue?: number | null): string {
  if (isGray(hue)) return `hsl(0 0% ${grayLightness(hue)}%)`;
  return `hsl(${resolveHue(name, hue)} 55% 46%)`;
}

// Foreground for a white line-icon / glyph on the bold disc. Hue discs are fixed-dark (L 46%) so white
// always reads; a light grey disc (L ≥ 50) flips the glyph to near-black to keep contrast.
export function discForeground(hue?: number | null): string {
  return isGray(hue) && grayLightness(hue) >= 50 ? '#1a1a1a' : '#fff';
}

// Valid stored disc value: a hue (0–359) or a grey sentinel (GRAY_BASE…GRAY_BASE+100). Shared by the
// category + account hue actions so both accept the greyscale ramp.
export function isValidDiscHue(n: number): boolean {
  return Number.isInteger(n) && ((n >= 0 && n <= 359) || (n >= GRAY_BASE && n <= GRAY_BASE + 100));
}

// Curated preset ring for the color picker — hues that stay distinct and legible at the bold disc's
// fixed 55%/46% S/L. `name` is the swatch's aria-label. Storing a hue (not hex) keeps white-icon
// contrast guaranteed; the trade-off is presets are hue-only (no greyscale / custom saturation).
export const HUE_PRESETS = [
  { hue: 0, name: 'Red' },
  { hue: 15, name: 'Vermilion' },
  { hue: 30, name: 'Orange' },
  { hue: 45, name: 'Amber' },
  { hue: 58, name: 'Yellow' },
  { hue: 72, name: 'Chartreuse' },
  { hue: 88, name: 'Lime' },
  { hue: 105, name: 'Grass' },
  { hue: 122, name: 'Green' },
  { hue: 145, name: 'Emerald' },
  { hue: 165, name: 'Jade' },
  { hue: 182, name: 'Teal' },
  { hue: 195, name: 'Cyan' },
  { hue: 208, name: 'Sky' },
  { hue: 222, name: 'Blue' },
  { hue: 238, name: 'Sapphire' },
  { hue: 252, name: 'Indigo' },
  { hue: 266, name: 'Violet' },
  { hue: 280, name: 'Purple' },
  { hue: 296, name: 'Fuchsia' },
  { hue: 312, name: 'Magenta' },
  { hue: 328, name: 'Pink' },
  { hue: 342, name: 'Rose' },
  { hue: 354, name: 'Crimson' },
] as const;

// Neutral ramp from black (L 0%) to white (L 100%), encoded as grey sentinels. Rendered in the picker
// after the hues; the glyph foreground flips dark past L 50% (discForeground) so it stays legible.
export const GRAY_PRESETS = [
  { hue: GRAY_BASE + 0, name: 'Black' },
  { hue: GRAY_BASE + 20, name: 'Charcoal' },
  { hue: GRAY_BASE + 40, name: 'Slate' },
  { hue: GRAY_BASE + 60, name: 'Grey' },
  { hue: GRAY_BASE + 80, name: 'Silver' },
  { hue: GRAY_BASE + 100, name: 'White' },
] as const;
