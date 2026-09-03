import type { HeatmapCell } from '../heatmap';
import { toCalendarLayout } from '../heatmap';
import { formatBahtWhole } from '@shared/money';
import { formatDayHeading } from '@shared/date';

// intensity 0..4 → a background. 0 is the bare surface (an empty day); 1..4 step up a neutral ink via
// color-mix so the ramp is one hue-free scale and theme-aware. Explicit array (not a computed class
// name) so there's no dynamic Tailwind class the JIT can't see — these are inline styles, not classes.
const BG = [
  'var(--color-surface-2)',
  'color-mix(in oklab, var(--color-text) 25%, var(--color-surface-2))',
  'color-mix(in oklab, var(--color-text) 50%, var(--color-surface-2))',
  'color-mix(in oklab, var(--color-text) 75%, var(--color-surface-2))',
  'var(--color-text)',
] as const;

// Sunday-started narrow weekday labels (S M T W T F S), derived via Intl from a known Sunday
// (2023-01-01) rather than hard-coded letters, so they stay correct if the locale ever changes.
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' });
const WEEKDAYS = Array.from({ length: 7 }, (_, i) =>
  weekdayFmt.format(new Date(Date.UTC(2023, 0, 1 + i))),
);

// The day-of-month for a YYYY-MM-DD key (the trailing DD as a number — no zero-pad to display).
function dayOfMonth(date: string): number {
  return Number(date.split('-')[2]);
}

// A real month-calendar glance at where a cycle's spending fell — weekday columns with each day under
// its own weekday (leading blanks before the cycle's first day), darker = heavier. CSS grid, not an
// ECharts calendar: the chart coordinate is cramped at 412px and a plain grid themes for free. The
// cycle is a billing cycle, so days run continuously across the month boundary in one grid.
// NON-INTERACTIVE for v1 (Records has no single-day filter to link to); each spend day carries an
// aria-label + title with its figure, empty days and padding blanks are aria-hidden.
// ponytail: add tap-through to that day's records once Records gains a ?date= day filter.
export function SpendHeatmap({ cells }: { cells: HeatmapCell[] }) {
  const layout = toCalendarLayout(cells);
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Daily spending this cycle">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Daily spending
      </h2>
      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className="text-center text-[11px]"
            style={{ color: 'var(--color-muted)' }}
            aria-hidden="true"
          >
            {w}
          </span>
        ))}
        {layout.map((c, i) => {
          if (c === null) return <span key={`pad-${i}`} aria-hidden="true" />;
          const spent = c.total > 0;
          const label = spent
            ? `${formatDayHeading(c.date)}: ${formatBahtWhole(c.total)}`
            : undefined;
          return (
            <span
              key={c.date}
              className="tnum grid aspect-square place-items-center rounded text-[11px]"
              style={{
                background: BG[c.intensity] ?? BG[0],
                color: spent ? 'var(--color-text)' : 'var(--color-muted)',
              }}
              title={label}
              aria-label={label}
              aria-hidden={spent ? undefined : true}
            >
              {dayOfMonth(c.date)}
            </span>
          );
        })}
      </div>
    </section>
  );
}
