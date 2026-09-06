import Link from 'next/link';
import type { ReactNode } from 'react';
import type { HomeForward } from '../use-home';
import { formatBahtWhole, formatCurrencyWhole } from '@shared/money';
import { tomorrowAllowance } from '../dashboard';

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

// What's left of today — today's allowance (safe-to-spend frozen at the value it held when the day
// started) minus what today has already spent.
//
// The HEADLINE is the remainder, not the allowance, for two reasons. It is the number you actually
// act on: standing in a shop the question is "can I afford this?", and that is the remainder — the
// allowance is the context it is measured against. And it keeps this card distinguishable from
// SafeToSpendCard below; leading with the allowance put two near-identical figures (฿1,942 above
// ฿1,900) a hundred pixels apart, which read as a rendering fault rather than two answers.
//
// The frozen figure survives as the DENOMINATOR — the same numerator-of-a-fixed-target shape Home's
// "Spent this cycle" card already uses (`฿26,298 of ฿50,000`). The remainder moves during the day;
// what it is measured against does not, which is the whole point of the allowance.
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
  // Overspent flips the title rather than showing a negative under "Left to spend today", which
  // would be a heading contradicting its own figure. A zero allowance is red for the same reason
  // SafeToSpendCard paints it red: the cycle's budget is already gone.
  const alarm = over || allowance === 0;
  return (
    <CardShell title={over ? "Over today's allowance" : 'Left to spend today'}>
      <span
        className="tnum text-4xl font-semibold"
        style={alarm ? { color: 'var(--color-loss)' } : undefined}
      >
        {formatBahtWhole(Math.abs(left))}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {spentToday === 0 ? (
          'Nothing spent yet today'
        ) : (
          <>
            <span className="tnum">{formatBahtWhole(spentToday)}</span> of{' '}
            <span className="tnum">{formatBahtWhole(allowance)}</span> spent today
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
          style={{ color: 'var(--color-text)' }}
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
  const tomorrow = tomorrowAllowance(safePerDay, daysLeft);
  return (
    <CardShell title="Safe to spend / day">
      <span className="tnum text-4xl font-semibold">{formatBahtWhole(safePerDay)}</span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        over {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
        {/* Tomorrow's figure if nothing more is spent today — the same rescale the share card
            prints, from the one helper both read. Null on the cycle's last day. */}
        {tomorrow !== null && (
          <>
            {' · '}
            <span className="tnum">{formatBahtWhole(tomorrow)}</span> tomorrow
          </>
        )}
      </span>
      <UpcomingLine upcoming={upcoming} />
    </CardShell>
  );
}
