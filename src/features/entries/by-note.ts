import type { EntryRow } from './schema';

export type NoteRow = { note: string; total: number; count: number };

const NO_NOTE = 'No note';

// Rank a set of entries by note text — "where did it actually go" at merchant granularity, from the
// note column the ledger already stores. Net (outflows stored negative, inflows positive; negating
// makes a refund subtract), biggest first. Blank/whitespace/null notes collapse into one 'No note'
// bucket rather than littering the list with untitled rows.
export function topNotes(entries: EntryRow[]): NoteRow[] {
  const byNote = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const key = e.note !== null && e.note.trim() !== '' ? e.note : NO_NOTE;
    const seen = byNote.get(key) ?? { total: 0, count: 0 };
    byNote.set(key, { total: seen.total + -e.amount, count: seen.count + 1 });
  }
  return [...byNote.entries()]
    .map(([note, v]) => ({ note, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
}
