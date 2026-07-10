// Autocomplete filtering for the records search combobox. Kept pure (no React) so the matching
// rule is unit-tested independently of the component glue.

// Suggestions whose text *contains* the query (case-insensitive) — same "contains" rule as the DB
// search, so the dropdown never offers a value the search itself wouldn't match. Prefix matches rank
// above mid-string ones; ties keep source order (the caller passes an already-sorted list, and
// Array.sort is stable). Empty query → no suggestions, so the dropdown only opens once you type.
export function filterSuggestions(all: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return all
    .filter((s) => s.toLowerCase().includes(q))
    .sort((a, b) => rank(a, q) - rank(b, q))
    .slice(0, limit);
}

function rank(s: string, q: string): number {
  return s.toLowerCase().startsWith(q) ? 0 : 1;
}

// Wrap a highlighted-option index by `delta`, cycling past either end. Returns -1 for an empty list
// (nothing to highlight).
export function wrapIndex(current: number, length: number, delta: number): number {
  if (length === 0) return -1;
  return (current + delta + length) % length;
}
