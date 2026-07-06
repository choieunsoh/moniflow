import { formatBaht, formatSignedBaht } from '@shared/money';
import type { Summary } from '../queries';

// Four balanced figures, equal weight — a summary *bar*, deliberately not the hero-metric cliché
// (one giant gradient number over supporting stats). Net leads by color/sign only, not by size.
export function SummaryBar({ summary }: { summary: Summary }) {
  const stats = [
    { label: 'Net flow', value: formatSignedBaht(summary.net), color: toneColor(summary.net) },
    { label: 'Inflow', value: formatBaht(summary.inflow), color: 'var(--color-gain)' },
    { label: 'Outflow', value: formatBaht(Math.abs(summary.outflow)), color: 'var(--color-loss)' },
    {
      label: 'Entries',
      value: new Intl.NumberFormat('en-US').format(summary.count),
      color: 'var(--color-text)',
    },
  ];
  return (
    <dl className="panel grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col gap-1.5 p-5">
          <dt className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {s.label}
          </dt>
          <dd className="tnum text-2xl font-semibold" style={{ color: s.color }}>
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function toneColor(n: number): string {
  if (n > 0) return 'var(--color-gain)';
  if (n < 0) return 'var(--color-loss)';
  return 'var(--color-text)';
}
