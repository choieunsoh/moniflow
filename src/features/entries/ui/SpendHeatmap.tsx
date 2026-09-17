import type { HeatmapCell } from '../heatmap';
import { CalendarGrid } from './CalendarGrid';

// The Trends card: a non-interactive glance at where the anchor cycle's discretionary spending fell.
// The grid itself is shared with the Records calendar (CalendarGrid), which adds marks and tap-to-select.
export function SpendHeatmap({ cells }: { cells: HeatmapCell[] }) {
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Daily spending this cycle">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        Daily spending
      </h2>
      <CalendarGrid cells={cells} />
    </section>
  );
}
