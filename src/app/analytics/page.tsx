'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { useAnalytics } from '@features/entries/use-analytics';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import { emojiFor } from '@features/categories/queries';
import { formatBahtWhole } from '@shared/money';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { trendAverage } from '@features/entries/trend';

// Analytics = the zoom-out surface. Home answers "what did I spend this cycle"; this answers "is that
// normal for me". One screen: the six-cycle spending trend, with a dashed line marking your own
// average across the window (see trendAverage). Below it sits one of two lists: unfiltered, the
// category breakdown for the window; filtered by ?category=, that category's own per-cycle
// breakdown, so the header total always sums the list beneath it. The window is anchored to ?cycle=
// so it stays consistent with the cycle the rest of the app is showing.
export default function AnalyticsPage() {
  const params = useSearchParams();
  const cycleParam = params.get('cycle');
  const category = params.get('category');
  const { ready, data } = useAnalytics(cycleParam, category);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div
          role="status"
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  const { activeKey, bars, slices, total, emojiMap, iconSet, cycleRows } = data;
  const base = `/analytics?cycle=${activeKey}`;

  // No spend anywhere in the window — reuse Home's empty state rather than inventing a second one.
  // It teaches the interface (points at the keypad, offers the CSV restore) instead of saying "no
  // data", which matters double here: moniflow is the create-sqlite-next-app reference, so a
  // developer's first sight of Analytics is with an empty ledger.
  if (slices.length === 0) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Analytics</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  // "Last 6 cycles" asserted history the user may not have: lastCycles always returns six, so a
  // day-one ledger claimed six cycles over five empty slots. Name the window instead, and when there
  // is too little to average, say so — "is this normal for me" genuinely has no answer yet, and
  // pretending otherwise is the opposite of what this app is for.
  const last = bars[bars.length - 1];
  const subtitle =
    trendAverage(bars) === null
      ? 'Come back next cycle to see whether this is typical'
      : `${bars[0].label} – ${last.label} ${last.key.split('-')[0]}`;

  return (
    <PageContainer size="full">
      {/* sr-only heading root — Analytics' visible top heading is the <h2> panel title ("All
          spending" / the category), so without this the heading list has no <h1>. */}
      <h1 className="sr-only">Analytics</h1>
      <section className="panel flex flex-col gap-5 p-5">
        <header className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-base font-semibold">{category ?? 'All spending'}</h2>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {subtitle}
            </span>
          </div>
          <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
        </header>

        {category !== null ? (
          <div className="flex min-w-0">
            <HeaderFilterChip href={base} active label={category} />
          </div>
        ) : null}

        <TrendChart
          bars={bars}
          label={`${category ?? 'Total'} spending over the last ${bars.length} cycles`}
        />

        {category !== null ? (
          // Filtered: the list decomposes the total above it per cycle. No category disc — every
          // row is the same category, so six identical discs would mark nothing. monthLabel is the
          // x-axis's own label fn, so the list and the chart always agree (incl. the start-month
          // convention).
          <ul className="flex flex-col gap-2.5">
            {cycleRows.map((r) => (
              <li key={r.key} className="flex items-center text-sm">
                <Link
                  prefetch={false}
                  href={`/records?cycle=${r.key}&category=${encodeURIComponent(category)}`}
                  aria-label={`${category} records for ${r.label}`}
                  // min-h-11 (44px), NOT `.tap`: .tap is inline-flex and would fight the `flex`
                  // utility. The category rows get their 44px for free from the size-11 disc —
                  // these rows have no disc (every row is the same category), so without this they
                  // collapse to text height.
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-1">
                    <span className="truncate">{r.label}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                      ({r.count})
                    </span>
                  </span>
                  <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                    {formatBahtWhole(r.value)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {slices.map((s) => {
              const inner = (
                <>
                  <span
                    aria-hidden
                    className="grid size-11 shrink-0 place-items-center rounded-full text-2xl"
                    style={{ background: s.color, color: 'var(--color-on-accent)' }}
                  >
                    <CategoryGlyph emoji={emojiFor(emojiMap, s.name)} iconSet={iconSet} size={26} />
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-1">
                    <span className="truncate">{s.name}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                      ({s.count})
                    </span>
                  </span>
                  <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                    {formatBahtWhole(s.value)}
                  </span>
                </>
              );
              // "Other" is a synthetic tail bucket, not a real category — nothing to filter to, so
              // it stays static. Same rule the home donut's legend follows.
              return (
                <li key={s.name} className="flex items-center gap-3 text-sm">
                  {s.other ? (
                    <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
                  ) : (
                    <Link
                      prefetch={false}
                      href={`${base}&category=${encodeURIComponent(s.name)}`}
                      aria-label={`${s.name} trend`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
