import { NO_NOTE, type NoteRow } from '../by-note';
import { formatBahtWhole } from '@shared/money';

const MAX_ROWS = 12;

// "Where did it actually go" at merchant granularity — the cycle's spend ranked by note text (see
// topNotes), the question the category breakdown can't answer. A plain ranked list is the honest
// form for free text: no chart, no icon (a note has no hue). Capped at MAX_ROWS — the long tail of
// one-off notes isn't worth the scroll.
export function TopNotesList({
  notes,
  // The region's accessible name. Defaults to the current-cycle phrasing (Home/Trends); the /year
  // recap passes a window-appropriate label so screen readers don't hear "this cycle" on a 12-cycle list.
  label = 'Top notes this cycle',
}: {
  notes: NoteRow[];
  label?: string;
}) {
  if (notes.length === 0) return null;
  // The bucket earns its place by value like any other row, so selection happens FIRST and only
  // its position changes. Sorting it last before slicing would push a large residual past
  // MAX_ROWS and hide the very money that keeping the bucket was meant to account for.
  const shown = notes.slice(0, MAX_ROWS);
  const ordered = [
    ...shown.filter((n) => n.note !== NO_NOTE),
    ...shown.filter((n) => n.note === NO_NOTE),
  ];
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label={label}>
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Top notes
      </h2>
      <ul className="flex flex-col gap-2.5">
        {ordered.map((n) => (
          <li key={n.note} className="flex items-center gap-3 text-sm">
            <span className="flex min-w-0 flex-1 items-baseline gap-1">
              <span
                className="truncate"
                style={n.note === NO_NOTE ? { color: 'var(--color-muted)' } : undefined}
              >
                {n.note === NO_NOTE ? '(no note)' : n.note}
              </span>
              <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                ({n.count})
              </span>
            </span>
            <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
              {formatBahtWhole(n.total)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
