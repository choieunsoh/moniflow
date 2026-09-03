'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { RowChevron } from '@shared/ui/Chevron';
import { useMonth } from '@features/entries/use-month';
import { trendAverage, completeBars, stepMonth } from '@features/entries/trend';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { MonthSelector } from '@features/entries/ui/MonthSelector';
import { SwipeNav } from '@features/entries/ui/SwipeNav';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBahtWhole } from '@shared/money';

// /month — one calendar month seen across every year on record, stepped with ?month=. The question
// is "what does July look like for me", which neither Home (this cycle) nor Trends (the last six)
// can answer: seasonality needs the same month, not the recent past.
//
// Optionally scoped by ?category=, using the same primitive Trends uses — unfiltered the chart sums
// each year's row, filtered it reads one column (see use-month). The filtered list then decomposes
// the headline down the years, so the list and the chart always agree.
const pctFmt = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export default function MonthPage() {
  const params = useSearchParams();
  const monthParam = Number(params.get('month'));
  // Out-of-range or junk means "no opinion" — the hook then defaults to the current cycle's month.
  const month =
    Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : null;
  const category = params.get('category');
  const { ready, data } = useMonth(month, category);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Month across the years</h1>
        <p className="p-8 text-center" style={{ color: 'var(--color-muted)' }}>
          …
        </p>
      </PageContainer>
    );
  }

  const {
    monthName,
    bars,
    latest,
    delta,
    categories,
    cycleRows,
    firstYear,
    emojiMap,
    hueMap,
    iconSet,
  } = data;

  // The stepper carries the active category, so "Travel in July" steps to "Travel in August" rather
  // than dropping the filter on every tap.
  const hrefFor = (m: number) =>
    `/month?month=${pad2(m)}${category === null ? '' : `&category=${encodeURIComponent(category)}`}`;
  const base = `/month?month=${pad2(data.month)}`;

  // Computed once and fed to both the arrows and the swipe. Neither is ever null here: the calendar
  // is a ring, so Dec steps to Jan and there is no boundary to close.
  const prevHref = hrefFor(stepMonth(data.month, -1));
  const nextHref = hrefFor(stepMonth(data.month, 1));
  const selector = <MonthSelector month={data.month} prevHref={prevHref} nextHref={nextHref} />;

  if (firstYear === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Month across the years</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  // The month exists but has never come round inside the ledger's span — a young ledger asking for
  // December in July. Not an empty ledger, so the stepper stays and says where to go.
  if (latest === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">{monthName} across the years</h1>
        {selector}
        <SwipeNav prevHref={prevHref} nextHref={nextHref}>
          <section className="panel px-6 py-16 text-center">
            <h2 className="text-base font-semibold">No {monthName} on record yet</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--color-muted)' }}>
              Use the arrows above to look at another month.
            </p>
          </section>
        </SwipeNav>
      </PageContainer>
    );
  }

  const average = trendAverage(bars);
  // The average's real basis, NOT bars.length: trendAverage runs on completeBars, which drops the
  // live occurrence and any year with no spend. Saying "across 12 years" over a mean of 9 would put
  // a false denominator under a true figure.
  const averageBasis = completeBars(bars).length;

  return (
    <PageContainer size="full">
      <h1 className="sr-only">{monthName} across the years</h1>
      {selector}

      {/* Everything below the stepper swipes as one. The stepper stays OUTSIDE — SwipeNav sets a
          transform even at rest, and a transformed ancestor would stop it sticking. */}
      <SwipeNav prevHref={prevHref} nextHref={nextHref} className="-mt-3 flex flex-col gap-6">
        <section className="panel flex flex-col gap-5 p-5">
          <header className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="truncate text-base font-semibold">{category ?? 'All spending'}</h2>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {monthName} {latest.label}
                {latest.partial ? ' · in progress' : ''}
              </span>
            </div>
            <span className="tnum shrink-0 text-lg font-semibold">
              {formatBahtWhole(latest.value)}
            </span>
          </header>

          {category !== null ? (
            <div className="flex min-w-0">
              <HeaderFilterChip href={base} active label={category} />
            </div>
          ) : null}

          {/* The verdict line. A delta is a comparison, so it is withheld while the newest occurrence
            is still running — the same rule completeBars applies to the average, and for the same
            reason: July at day 2 against a whole July always reads as a collapse. */}
          {delta === null ? (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {latest.partial
                ? `Still in progress — comparable once ${monthName} ${latest.label} closes`
                : `No earlier ${monthName} to compare against`}
            </span>
          ) : delta.amount === 0 ? (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Same as {monthName} {delta.againstLabel}
            </span>
          ) : (
            <span
              className="text-sm"
              style={{
                color: delta.amount > 0 ? 'var(--color-loss)' : 'var(--color-gain)',
              }}
            >
              {delta.amount > 0 ? '↑' : '↓'} {formatBahtWhole(Math.abs(delta.amount))}
              {delta.pct === null ? '' : ` (${pctFmt.format(Math.abs(delta.pct))})`}{' '}
              {delta.amount > 0 ? 'more than' : 'less than'} {monthName} {delta.againstLabel}
            </span>
          )}

          <TrendChart
            bars={bars}
            budget={null}
            label={`${category ?? 'Total'} spending each ${monthName}`}
          />

          {/* Named because the chart's own Average line is a figure without a basis — a reader can see
            the dashes but not what they average over, and "every July since 2019" is the whole
            claim this page makes. */}
          {average === null ? null : (
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Averaging {formatBahtWhole(average)} across {averageBasis}{' '}
              {averageBasis === 1 ? 'completed year' : 'completed years'}
            </span>
          )}
        </section>

        {category !== null ? (
          // Filtered: one row per year, decomposing the headline. A zero year is KEPT — "you bought
          // none of this in July 2019" is the answer, and dropping it would leave the list shorter
          // than the chart it sits under.
          <section className="panel flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
              Every {monthName}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {cycleRows.map((r) =>
                // A zero year is real data and stays in the list, but it is NOT a link: there are no
                // records behind it, and a 44px target that opens an empty Records view is a tap the
                // interface promised something for. Rendered plain and muted, it reads as the
                // "nothing here" it is — which on a long-lived ledger is most of the early years.
                r.count === 0 ? (
                  // Same three columns as the linked row below (gap-3, label / figure / chevron) so
                  // the figures line up down the list; the chevron is dimmed, not dropped, or every
                  // zero row's figure sits one chevron-width right of the rest.
                  <li
                    key={r.key}
                    className="flex min-h-11 items-center gap-3 text-sm"
                    style={{ color: 'var(--color-faint)' }}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    <span className="tnum shrink-0">{formatBahtWhole(r.value)}</span>
                    <span className="flex shrink-0 opacity-40">
                      <RowChevron />
                    </span>
                  </li>
                ) : (
                  <li key={r.key} className="flex items-center text-sm">
                    <Link
                      prefetch={false}
                      href={`/records?cycle=${r.key}&category=${encodeURIComponent(category)}`}
                      aria-label={`${category} records for ${monthName} ${r.label}`}
                      // min-h-11 for the 44px target: these rows carry no category disc to inherit it
                      // from (every row is the same category), so without it they collapse to text height.
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
                ),
              )}
            </ul>
          </section>
        ) : (
          // Unfiltered: what the NEWEST occurrence was made of. Its figures sum to the headline above,
          // not to the whole window — a list of decade-long sums under a one-month headline would
          // invite the two to be read as the same thing.
          <section className="panel flex flex-col gap-3 p-5">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
              {monthName} {latest.label} by category
            </h2>
            <ul className="flex flex-col gap-2.5">
              {categories.map((c) => (
                <li key={c.name} className="flex items-center text-sm">
                  <Link
                    prefetch={false}
                    href={`${base}&category=${encodeURIComponent(c.name)}`}
                    aria-label={`${c.name} every ${monthName}`}
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
          </section>
        )}
      </SwipeNav>
    </PageContainer>
  );
}
