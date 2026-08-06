import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HomeForward } from '../use-home';
import { formatBahtWhole, formatCurrencyWhole } from '@shared/money';

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
  // Foreign bills with no pinned rate show in their own currency ($107), not a fake ฿107; multiple
  // currencies join with " + ". THB (and pinned-rate foreign) collapse into one ฿ figure upstream.
  const total = upcoming.byCurrency
    .map(({ currency, amount }) => formatCurrencyWhole(amount, currency))
    .join(' + ');
  return (
    <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
      Upcoming: {total} · {upcoming.count} {upcoming.count === 1 ? 'bill' : 'bills'} due
    </span>
  );
}

// Today's allowance — the same safe-to-spend arithmetic frozen at the value it held when the day
// started, so the headline holds still no matter how much you spend before midnight. That is the
// whole point of it sitting next to SafeToSpendCard, which slides down with every purchase: one is
// the target, the other the rate from here.
//
// Renders nothing without a total budget. SafeToSpendCard already owns that state, link and all, and
// a second card repeating "set a budget" is noise rather than an answer.
export function TodayAllowanceCard({
  allowance,
  spentToday,
}: {
  allowance: number | null;
  spentToday: number;
}) {
  if (allowance === null) return null;
  const left = allowance - spentToday;
  const over = left < 0;
  return (
    <CardShell title="Today's allowance">
      <span
        className="tnum text-4xl font-semibold"
        // A zero allowance means the cycle's budget is already gone — the same red SafeToSpendCard
        // uses for it, for the same fact.
        style={allowance === 0 ? { color: 'var(--color-loss)' } : undefined}
      >
        {formatBahtWhole(allowance)}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {spentToday === 0 ? (
          'Nothing spent yet today'
        ) : (
          <>
            <span className="tnum">{formatBahtWhole(spentToday)}</span> spent today ·{' '}
            <span className="tnum" style={over ? { color: 'var(--color-loss)' } : undefined}>
              {formatBahtWhole(Math.abs(left))} {over ? 'over' : 'left'}
            </span>
          </>
        )}
      </span>
    </CardShell>
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
        <UpcomingLine upcoming={upcoming} />
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
        <UpcomingLine upcoming={upcoming} />
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
