'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { useAnalytics } from '@features/entries/use-analytics';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { SpendHeatmap } from '@features/entries/ui/SpendHeatmap';
import { TopNotesList } from '@features/entries/ui/TopNotesList';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { AnomalyBanner } from '@features/entries/ui/AnomalyBanner';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBahtWhole } from '@shared/money';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { trendAverage } from '@features/entries/trend';

// Ambient "this row navigates" affordance for the tappable breakdown/cycle rows — an unfiltered
// category tap filters the trend, which a pointer user otherwise can't see (mobile has no hover).
// Faint + 16px so it signals without competing with the figure; aria-hidden, since each Link's own
// aria-label already carries the intent.
function RowChevron() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
      style={{ color: 'var(--color-faint)' }}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

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

  const {
    activeKey,
    bars,
    categories,
    total,
    emojiMap,
    hueMap,
    iconSet,
    cycleRows,
    budgetLine,
    anomalies,
    heatmapCells,
    topNotes,
  } = data;
  const base = `/analytics?cycle=${activeKey}`;

  // No spend anywhere in the window — reuse Home's empty state rather than inventing a second one.
  // It teaches the interface (points at the keypad, offers the CSV restore) instead of saying "no
  // data", which matters double here: moniflow is the create-sqlite-next-app reference, so a
  // developer's first sight of Analytics is with an empty ledger.
  if (categories.length === 0) {
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
      <AnomalyBanner anomalies={anomalies} />
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
          budget={budgetLine}
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
                  <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
                    {formatBahtWhole(r.value)}
                  </span>
                  <RowChevron />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          // The window's full category breakdown — every category, biggest first, no "Other"
          // rollup (that cap only exists to keep the home donut RING readable; there is no ring
          // here). Each marker takes the category's own hue. Tap a row to filter the trend to it.
          <ul className="flex flex-col gap-2.5">
            {categories.map((c) => (
              <li key={c.name} className="flex items-center text-sm">
                <Link
                  prefetch={false}
                  href={`${base}&category=${encodeURIComponent(c.name)}`}
                  aria-label={`${c.name} trend`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <CategoryIcon
                    emoji={emojiFor(emojiMap, c.name)}
                    name={c.name}
                    hue={hueFor(hueMap, c.name)}
                    iconSet={iconSet}
                  />
                  <span className="flex min-w-0 flex-1 items-baseline gap-1">
                    <span className="truncate">{c.name}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                      ({c.count})
                    </span>
                  </span>
                  <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
                    {formatBahtWhole(c.value)}
                  </span>
                  <RowChevron />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The trend panel is the page's primary; the heatmap and top-notes are supporting. Grouping
          them in one tighter-gap block (12px between the two, vs the 24px PageContainer gap above)
          reads as "1 primary + a supporting pair" instead of three same-weight stacked panels. */}
      <div className="flex flex-col gap-3">
        <SpendHeatmap cells={heatmapCells} />
        <TopNotesList notes={topNotes} />
      </div>
    </PageContainer>
  );
}
