// Deterministic disc tint per category name — a stable hue from a string hash, so each category keeps
// its color across sessions with nothing stored. The emoji renders on top, so callers apply this at a
// low alpha (a soft tint), not as a saturated fill.
// ponytail: derived-from-name, not a stored/pickable color. Add a `color` column to category_meta +
// a picker if manual control is ever wanted.
export function categoryHue(name: string): number {
  let hash = 0;
  for (const ch of name) {
    hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  }
  return Math.abs(hash) % 360;
}

// The soft tint used behind emoji (callers apply it at low alpha).
export function categoryColor(name: string): string {
  return `hsl(${categoryHue(name)} 60% 55%)`;
}

// A deeper, saturated disc for white line-icons (Monefy look) — lower lightness so white keeps
// contrast across hues.
export function categoryColorBold(name: string): string {
  return `hsl(${categoryHue(name)} 55% 46%)`;
}
