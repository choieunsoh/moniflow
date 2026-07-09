import { formatBaht } from '@shared/money';
import { toBars } from '../breakdown';
import type { Breakdown as BreakdownRow } from '../queries';
import { emojiFor } from '@features/categories/queries';

// A ranked bar list — outflow-heavy categories/accounts read at a glance. Magnitudes only (spending
// is negative); the bar width is relative to the biggest row in the set. Pass `emojis` to lead each
// row with its category emoji.
export function Breakdown({
  title,
  rows,
  emojis,
}: {
  title: string;
  rows: BreakdownRow[];
  emojis?: Record<string, string>;
}) {
  const bars = toBars(rows);
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {bars.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing in this cycle.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bars.map((b) => (
            <li key={b.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  {emojis ? (
                    <span aria-hidden className="leading-none">
                      {emojiFor(emojis, b.key)}
                    </span>
                  ) : null}
                  <span className="truncate">{b.key}</span>
                </span>
                <span className="tnum" style={{ color: 'var(--color-text)' }}>
                  {formatBaht(Math.abs(b.total))}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded"
                style={{ background: 'var(--color-border)' }}
              >
                <div
                  className="h-full rounded"
                  style={{ width: `${b.pct}%`, background: 'var(--color-accent)' }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
