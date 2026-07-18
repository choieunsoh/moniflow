import Link from 'next/link';
import type { ReactNode } from 'react';
import type { DashboardData } from '../use-dashboard';
import { formatBaht, formatBahtWhole } from '@shared/money';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatDayHeading } from '@shared/date';

// The four current-cycle overview cards, stacked. Big glance figures use formatBahtWhole (computed);
// recent-activity rows echo stored amounts with formatBaht (exact). All the decisions (null vs 0 vs
// number) are made upstream in the pure dashboard math — this file only renders.
export function DashboardCards({ data }: { data: DashboardData }) {
  return (
    <div className="flex flex-col gap-4">
      <SafeToSpendCard
        safePerDay={data.safePerDay}
        avgPerDay={data.avgPerDay}
        daysLeft={data.daysLeft}
      />
      <ProjectedCard projected={data.projected} totalBudget={data.totalBudget} />
      <VsLastCard delta={data.delta} />
      <RecentCard
        recent={data.recent}
        emojiMap={data.emojiMap}
        hueMap={data.hueMap}
        iconSet={data.iconSet}
      />
    </div>
  );
}

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

// safePerDay === null → no budget set: show the actual average + a link to set one. === 0 → over
// budget. Otherwise the per-day allowance.
function SafeToSpendCard({
  safePerDay,
  avgPerDay,
  daysLeft,
}: {
  safePerDay: number | null;
  avgPerDay: number;
  daysLeft: number;
}) {
  if (safePerDay === null) {
    return (
      <CardShell title="Average / day so far">
        <span className="tnum text-2xl font-semibold">{formatBahtWhole(avgPerDay)}</span>
        <Link
          href="/budgets"
          prefetch={false}
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          Set a total budget for a safe-to-spend figure →
        </Link>
      </CardShell>
    );
  }
  if (safePerDay === 0) {
    return (
      <CardShell title="Safe to spend / day">
        <span className="tnum text-2xl font-semibold" style={{ color: 'var(--color-loss)' }}>
          {formatBahtWhole(0)}
        </span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing left in this cycle's budget
        </span>
      </CardShell>
    );
  }
  return (
    <CardShell title="Safe to spend / day">
      <span className="tnum text-2xl font-semibold">{formatBahtWhole(safePerDay)}</span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        over {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
      </span>
    </CardShell>
  );
}

// projected === null → too early to project. With a budget, show whether the pace lands over/under.
function ProjectedCard({
  projected,
  totalBudget,
}: {
  projected: number | null;
  totalBudget: number | null;
}) {
  if (projected === null) {
    return (
      <CardShell title="Projected this cycle">
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Too early to project — check back in a few days
        </span>
      </CardShell>
    );
  }
  const over = totalBudget !== null && projected > totalBudget;
  return (
    <CardShell title="Projected this cycle">
      <span className="tnum text-2xl font-semibold">{formatBahtWhole(projected)}</span>
      {totalBudget !== null ? (
        <span
          className="text-sm"
          style={{ color: over ? 'var(--color-loss)' : 'var(--color-muted)' }}
        >
          {over
            ? `${formatBahtWhole(projected - totalBudget)} over budget at this pace`
            : 'on track for your budget'}
        </span>
      ) : null}
    </CardShell>
  );
}

// delta === null → no comparable earlier cycle. up = spending more (loss red), down = less (accent).
function VsLastCard({ delta }: { delta: DashboardData['delta'] }) {
  if (delta === null) {
    return (
      <CardShell title="This cycle vs last">
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No comparable earlier cycle yet
        </span>
      </CardShell>
    );
  }
  if (delta.direction === 'same') {
    return (
      <CardShell title="This cycle vs last">
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Same as last cycle
        </span>
      </CardShell>
    );
  }
  const up = delta.direction === 'up';
  const color = up ? 'var(--color-loss)' : 'var(--color-accent-text)';
  return (
    <CardShell title="This cycle vs last">
      <span className="tnum text-2xl font-semibold" style={{ color }}>
        {up ? '↑' : '↓'} {formatBahtWhole(Math.abs(delta.delta))}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {up ? 'more than' : 'less than'} last cycle ({formatBahtWhole(delta.prevTotal)})
      </span>
    </CardShell>
  );
}

function RecentCard({
  recent,
  emojiMap,
  hueMap,
  iconSet,
}: {
  recent: DashboardData['recent'];
  emojiMap: DashboardData['emojiMap'];
  hueMap: DashboardData['hueMap'];
  iconSet: DashboardData['iconSet'];
}) {
  return (
    <CardShell title="Recent activity">
      <ul className="flex flex-col gap-2.5">
        {recent.map((e) => (
          <li key={e.id}>
            <Link
              prefetch={false}
              href="/records"
              aria-label={`${e.category} ${formatBaht(Math.abs(e.amount))} on ${formatDayHeading(e.date)}`}
              className="flex min-h-11 items-center gap-3 text-sm"
            >
              <CategoryIcon
                emoji={emojiFor(emojiMap, e.category)}
                name={e.category}
                hue={hueFor(hueMap, e.category)}
                iconSet={iconSet}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{e.note ? e.note : e.category}</span>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {formatDayHeading(e.date)}
                </span>
              </span>
              <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                {formatBaht(Math.abs(e.amount))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}
