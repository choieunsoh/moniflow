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

// The soft tint used behind emoji (callers apply it at low alpha).
export function categoryColor(name: string, hue?: number | null): string {
  return `hsl(${resolveHue(name, hue)} 60% 55%)`;
}

// A deeper, saturated disc for white line-icons (Monefy look) — lower lightness so white keeps
// contrast across hues.
export function categoryColorBold(name: string, hue?: number | null): string {
  return `hsl(${resolveHue(name, hue)} 55% 46%)`;
}

// Curated preset ring for the color picker — hues that stay distinct and legible at the bold disc's
// fixed 55%/46% S/L. `name` is the swatch's aria-label. Storing a hue (not hex) keeps white-icon
// contrast guaranteed; the trade-off is presets are hue-only (no greyscale / custom saturation).
export const HUE_PRESETS = [
  { hue: 0, name: 'Red' },
  { hue: 25, name: 'Orange' },
  { hue: 42, name: 'Amber' },
  { hue: 55, name: 'Yellow' },
  { hue: 80, name: 'Lime' },
  { hue: 115, name: 'Green' },
  { hue: 150, name: 'Emerald' },
  { hue: 172, name: 'Teal' },
  { hue: 192, name: 'Cyan' },
  { hue: 215, name: 'Blue' },
  { hue: 245, name: 'Indigo' },
  { hue: 268, name: 'Violet' },
  { hue: 290, name: 'Purple' },
  { hue: 315, name: 'Magenta' },
  { hue: 335, name: 'Pink' },
  { hue: 350, name: 'Rose' },
] as const;
