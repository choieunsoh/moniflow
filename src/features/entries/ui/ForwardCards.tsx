import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HomeForward } from '../use-home';
import { formatBahtWhole } from '@shared/money';

// The current-cycle forward cards, moved out of the former DashboardCards so Home can render them
// under its headline. All the null/0/number decisions are made upstream in the pure dashboard math
// (see dashboard.ts) — these components only render.

function CardShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

// The upcoming-bills sub-line, shared by all three Safe-to-spend variants so the phrasing and the
// singular/plural rule live in one place. Renders nothing when nothing is due.
function UpcomingLine({ upcoming }: { upcoming: HomeForward['upcoming'] }) {
  if (upcoming.count === 0) return null;
  return (
    <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
      Upcoming: {formatBahtWhole(upcoming.total)} · {upcoming.count}{' '}
      {upcoming.count === 1 ? 'bill' : 'bills'} due
    </span>
  );
}

// safePerDay === null → no budget set: show the actual average + a link to set one. === 0 → over
// budget. Otherwise the per-day allowance.
export function SafeToSpendCard({
  safePerDay,
  avgPerDay,
  daysLeft,
  upcoming,
}: {
  safePerDay: number | null;
  avgPerDay: number;
  daysLeft: number;
  upcoming: HomeForward['upcoming'];
}) {
  if (safePerDay === null) {
    return (
      <CardShell title="Average / day so far">
        <span className="tnum text-4xl font-semibold">{formatBahtWhole(avgPerDay)}</span>
        <Link
          href="/budgets"
          prefetch={false}
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Set a total budget for a safe-to-spend figure →
        </Link>
        {upcoming.count > 0 ? (
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Upcoming: {formatBahtWhole(upcoming.total)} · {upcoming.count}{' '}
            {upcoming.count === 1 ? 'bill' : 'bills'} due
          </span>
        ) : null}
      </CardShell>
    );
  }
  if (safePerDay === 0) {
    return (
      <CardShell title="Safe to spend / day">
        <span className="tnum text-4xl font-semibold" style={{ color: 'var(--color-loss)' }}>
          {formatBahtWhole(0)}
        </span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing left in this cycle's budget
        </span>
        {upcoming.count > 0 ? (
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Upcoming: {formatBahtWhole(upcoming.total)} · {upcoming.count}{' '}
            {upcoming.count === 1 ? 'bill' : 'bills'} due
          </span>
        ) : null}
      </CardShell>
    );
  }
  return (
    <CardShell title="Safe to spend / day">
      <span className="tnum text-4xl font-semibold">{formatBahtWhole(safePerDay)}</span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        over {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
      </span>
      <UpcomingLine upcoming={upcoming} />
    </CardShell>
  );
}
