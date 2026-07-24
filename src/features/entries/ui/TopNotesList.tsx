import type { NoteRow } from '../by-note';
import { formatBahtWhole } from '@shared/money';

const MAX_ROWS = 12;

// "Where did it actually go" at merchant granularity — the cycle's spend ranked by note text (see
// topNotes), the question the category breakdown can't answer. A plain ranked list is the honest
// form for free text: no chart, no icon (a note has no hue). Capped at MAX_ROWS — the long tail of
// one-off notes isn't worth the scroll.
export function TopNotesList({ notes }: { notes: NoteRow[] }) {
  if (notes.length === 0) return null;
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Top notes this cycle">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Top notes
      </h2>
      <ul className="flex flex-col gap-2.5">
        {notes.slice(0, MAX_ROWS).map((n) => (
          <li key={n.note} className="flex items-center gap-3 text-sm">
            <span className="flex min-w-0 flex-1 items-baseline gap-1">
              <span className="truncate">{n.note}</span>
              <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                ({n.count})
              </span>
            </span>
            <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
              {formatBahtWhole(n.total)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
