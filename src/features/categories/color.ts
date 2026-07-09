// Deterministic disc tint per category name — a stable hue from a string hash, so each category keeps
// its color across sessions with nothing stored. The emoji renders on top, so callers apply this at a
// low alpha (a soft tint), not as a saturated fill.
// ponytail: derived-from-name, not a stored/pickable color. Add a `color` column to category_meta +
// a picker if manual control is ever wanted.
export function categoryColor(name: string): string {
  let hash = 0;
  for (const ch of name) {
    hash = (Math.imul(hash, 31) + (ch.codePointAt(0) ?? 0)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 60% 55%)`;
}
