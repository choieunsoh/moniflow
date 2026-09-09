import type { NoteSuggestionRow } from './queries';

export type NoteSuggestion = { category: string; account: string };

// The category and account a given note has always taken, or null when the ledger has nothing to
// say about it.
//
// The match is EXACT on the trimmed, case-folded note — not a prefix and not a substring. A
// suggestion that fired on a partial word would change under you as you typed, and the whole value
// of the chip this feeds is that it is stable enough to tap without reading it first.
//
// Frequency wins; a tie goes to the more recent combination, so a category you have recently moved
// a note to beats an equal count of older rows rather than being stuck behind history.
export function pickNoteSuggestion(rows: NoteSuggestionRow[], note: string): NoteSuggestion | null {
  const key = note.trim().toLowerCase();
  if (key === '') return null;

  let best: NoteSuggestionRow | null = null;
  for (const row of rows) {
    if (row.note.trim().toLowerCase() !== key) continue;
    if (
      best === null ||
      row.count > best.count ||
      (row.count === best.count && row.last > best.last)
    ) {
      best = row;
    }
  }
  return best === null ? null : { category: best.category, account: best.account };
}
