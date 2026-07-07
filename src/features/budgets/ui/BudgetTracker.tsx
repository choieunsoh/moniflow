import Link from 'next/link';
import { formatBaht } from '@shared/money';
import type { BudgetRow, TotalRow } from '../budget';

// Budget-vs-spend bars for the dashboard: a total bar plus one bar per budgeted category, colored
// by whether spend is pacing ahead of the cycle's calendar progress. Empty state links to the
// standing /budgets page where limits are set. Uses next/link (not a plain <a>) to match
// CycleSelector's convention and satisfy @next/next/no-html-link-for-pages.
export function BudgetTracker({ rows, total }: { rows: BudgetRow[]; total: TotalRow | null }) {
  if (rows.length === 0 && total === null) {
    return (
      <section className="panel p-5">
        <h2 className="mb-2 text-base font-semibold">Budgets</h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No budgets set yet.{' '}
          <Link href="/budgets" className="underline">
            Set one
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold">Budgets</h2>
      <ul className="flex flex-col gap-3">
        {total && <BudgetBar key="total" label="Total" row={total} />}
        {rows.map((row) => (
          <BudgetBar key={row.category} label={row.category} row={row} />
        ))}
      </ul>
    </section>
  );
}

function BudgetBar({ label, row }: { label: string; row: BudgetRow | TotalRow }) {
  const width = Math.min(100, row.pct);
  const barColor = row.overPace ? 'var(--color-loss)' : 'var(--color-accent)';
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tnum" style={{ color: 'var(--color-text)' }}>
          {formatBaht(row.spent)} / {formatBaht(row.budget)} · {Math.round(row.pct)}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded" style={{ background: 'var(--color-border)' }}>
        <div className="h-full rounded" style={{ width: `${width}%`, background: barColor }} />
      </div>
    </li>
  );
}
