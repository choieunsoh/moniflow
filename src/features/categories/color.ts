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
