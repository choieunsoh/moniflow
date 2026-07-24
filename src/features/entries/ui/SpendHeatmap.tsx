import type { HeatmapCell } from '../heatmap';
import { formatBahtWhole } from '@shared/money';
import { formatDayHeading } from '@shared/date';

// intensity 0..4 → a background. 0 is the bare surface (an empty day); 1..4 step up the accent via
// color-mix so the ramp is one hue and theme-aware. Explicit array (not a computed class name) so
// there's no dynamic Tailwind class the JIT can't see — these are inline styles, not classes.
const BG = [
  'var(--color-surface-2)',
  'color-mix(in oklab, var(--color-accent) 25%, var(--color-surface-2))',
  'color-mix(in oklab, var(--color-accent) 50%, var(--color-surface-2))',
  'color-mix(in oklab, var(--color-accent) 75%, var(--color-surface-2))',
  'var(--color-accent)',
] as const;

// A calendar-ish glance at where a cycle's spending fell — 7 columns, one square per day, darker =
// heavier. CSS grid, not an ECharts calendar: the chart coordinate is cramped at 412px and a plain
// grid themes for free. NON-INTERACTIVE for v1 (Records has no single-day filter to link to); each
// populated day carries an aria-label + title with its figure, empty days are aria-hidden.
// ponytail: add tap-through to that day's records once Records gains a ?date= day filter.
export function SpendHeatmap({ cells }: { cells: HeatmapCell[] }) {
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Daily spending this cycle">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Daily spending
      </h2>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c) => {
          const label =
            c.total === 0 ? undefined : `${formatDayHeading(c.date)}: ${formatBahtWhole(c.total)}`;
          return (
            <span
              key={c.date}
              className="block aspect-square rounded"
              style={{ background: BG[c.intensity] ?? BG[0] }}
              title={label}
              aria-label={label}
              aria-hidden={c.total === 0 ? true : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}
