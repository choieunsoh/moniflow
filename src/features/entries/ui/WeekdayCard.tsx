import type { WeekdayStats } from '../by-weekday';
import { formatBahtWhole } from '@shared/money';

// Below this many entries a "pattern" is noise — say so rather than crown a peak day off one receipt
// (the same honesty the trend subtitle applies to thin history).
const MIN_FOR_PATTERN = 5;

// The active cycle's weekly rhythm (see byWeekday): a compact seven-row bar list plus a one-line
// takeaway. Bars are relative to the busiest day. Renders nothing on an empty cycle.
export function WeekdayCard({ stats }: { stats: WeekdayStats }) {
  if (stats.totalCount === 0 || stats.peak === null) return null;
  const max = Math.max(...stats.rows.map((r) => r.total), 1);
  const thin = stats.totalCount < MIN_FOR_PATTERN;
  const takeaway = thin
    ? 'Not enough spending yet to call a weekly pattern'
    : stats.weekendRatio !== null && stats.weekendRatio >= 1.2
      ? `${stats.peak.day} is your peak · weekends run ${stats.weekendRatio.toFixed(1)}× weekdays`
      : stats.weekendRatio !== null && stats.weekendRatio <= 0.8
        ? `${stats.peak.day} is your peak · weekdays run heavier than weekends`
        : `${stats.peak.day} is your peak spending day`;

  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Spending by day of week">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        By day of week
      </h2>
      <ul className="flex flex-col gap-2">
        {stats.rows.map((r) => (
          <li key={r.day} className="flex items-center gap-3 text-sm">
            <span className="w-9 shrink-0" style={{ color: 'var(--color-muted)' }}>
              {r.day}
            </span>
            <span
              className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full"
              style={{ background: 'var(--color-border)' }}
            >
              <span
                className="h-full rounded-full"
                style={{ width: `${(r.total / max) * 100}%`, background: 'var(--color-text)' }}
              />
            </span>
            <span className="tnum w-16 shrink-0 text-right" style={{ color: 'var(--color-text)' }}>
              {formatBahtWhole(r.total)}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {takeaway}
      </span>
    </section>
  );
}
