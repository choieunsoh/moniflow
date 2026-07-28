'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { RowChevron } from '@shared/ui/Chevron';
import { ViewToggle } from '@shared/ui/ViewToggle';
import { useCategoryReport } from '@features/entries/use-category-report';
import type { ReportView } from '@features/entries/category-report';
import { trendAverage, completeBars } from '@features/entries/trend';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { YearSelector } from '@features/entries/ui/YearSelector';
import { SwipeNav } from '@features/entries/ui/SwipeNav';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBahtWhole } from '@shared/money';

// /report — pick a category, then watch it over time. The question is "what does this one thing cost
// me", which no other surface answers: Trends can scope a category but only across six cycles, /year
// holds a whole year but cannot scope one, and /categories leads to a flat records list.
//
// One route, two states, exactly as /month and /analytics work: no ?category= is the picker list,
// ?category= is that category's report, and the header chip clears back.
//
// The Monthly|Yearly toggle switches the WINDOW as well as the granularity (see use-category-report).
// That is the load-bearing decision here — it is why the number you tap in the list is the headline
// you land on.

function reportHref(view: ReportView, year: number, category: string | null): string {
  const params = new URLSearchParams();
  if (view === 'yearly') params.set('view', 'yearly');
  // Carried in BOTH views. Yearly ignores it — its window is every year on record — but keeping it
  // means toggling back to Monthly returns to the year you left rather than snapping to this one.
  params.set('year', String(year));
  if (category !== null) params.set('category', category);
  return `/report?${params.toString()}`;
}

export default function ReportPage() {
  const params = useSearchParams();
  const view: ReportView = params.get('view') === 'yearly' ? 'yearly' : 'monthly';
  const yearParam = Number(params.get('year'));
  // Junk or missing means "no opinion" — the hook then defaults to the current year and clamps
  // anything out of range, so nothing here has to guard the bounds.
  const year = Number.isInteger(yearParam) && yearParam > 0 ? yearParam : null;
  const category = params.get('category');
  const { ready, data } = useCategoryReport(view, year, category);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Category report</h1>
        <p className="p-8 text-center" style={{ color: 'var(--color-muted)' }}>
          …
        </p>
      </PageContainer>
    );
  }

  const {
    bars,
    total,
    categories,
    rows,
    year: activeYear,
    currentYear,
    firstYear,
    rangeLabel,
    emojiMap,
    hueMap,
    iconSet,
  } = data;

  // Only a ledger with nothing in it at all earns the onboarding screen. An empty YEAR is reachable
  // by stepping, and swapping the page there would both cry data loss and strand you — the stepper
  // is the only way back out.
  if (firstYear === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Category report</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  const heading = category ?? 'All spending';

  // Monthly steps through years. Yearly has nothing to step — its window IS every year — so the
  // stepper and the swipe both close, and computing both hrefs here once means the gesture and the
  // arrows can never disagree about what is reachable.
  const prevHref =
    view === 'monthly' && activeYear > firstYear
      ? reportHref('monthly', activeYear - 1, category)
      : null;
  const nextHref =
    view === 'monthly' && activeYear < currentYear
      ? reportHref('monthly', activeYear + 1, category)
      : null;

  const average = trendAverage(bars);
  // The average's real basis, NOT bars.length: trendAverage runs on completeBars, which drops the
  // live period and any period with no spend. A true mean under a false denominator is a lie.
  const averageBasis = completeBars(bars).length;
  const unit = view === 'monthly' ? 'month' : 'year';

  const chart = (
    <section className="panel flex flex-col gap-5 p-5">
      <header className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-base font-semibold">{heading}</h2>
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {rangeLabel}
          </span>
        </div>
        <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
      </header>

      {category !== null ? (
        <div className="flex min-w-0">
          <HeaderFilterChip href={reportHref(view, activeYear, null)} active label={category} />
        </div>
      ) : null}

      <ViewToggle
        options={[
          {
            label: 'Monthly',
            href: reportHref('monthly', activeYear, category),
            active: view === 'monthly',
          },
          {
            label: 'Yearly',
            href: reportHref('yearly', activeYear, category),
            active: view === 'yearly',
          },
        ]}
      />

      {/* A window with nothing in it still shows the toggle and the ฿0 headline above, but a flat
          zero-value chart under that headline draws a shape that promises data it doesn't have —
          /year suppresses its chart the same way in the equivalent branch. */}
      {total === 0 ? null : (
        <TrendChart
          bars={bars}
          budget={null}
          label={`${heading} ${view === 'monthly' ? `month by month in ${activeYear}` : 'year by year'}`}
        />
      )}

      {/* Named because the chart's Average line is a figure without a basis — a reader sees the
          dashes but not what they average over, and that basis is most of the claim. */}
      {average === null ? null : (
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          Averaging {formatBahtWhole(average)} across {averageBasis} completed{' '}
          {averageBasis === 1 ? unit : `${unit}s`}
        </span>
      )}
    </section>
  );

  // A year the ledger simply has nothing in. Reachable by stepping, so keep the stepper and say so
  // rather than drawing a chart of zeros under a ฿0 headline.
  const list =
    category !== null ? (
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          {view === 'monthly' ? `Every month in ${activeYear}` : 'Every year'}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) =>
            // A period with no spend is real data and stays in the list, but it is NOT a link: there
            // are no records behind it, and a 44px target that opens an empty view is a tap the
            // interface promised something for.
            r.count === 0 ? (
              // Same three columns as the linked row below (gap-3, label / figure / chevron) so the
              // figures line up down the list. The chevron is present but dimmed rather than dropped:
              // omitting it shifted every zero row's figure right by its width, and a dimmed one reads
              // as the disabled affordance it is instead of a missing one.
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
                  // A month goes to its records. A YEAR goes to that year's months instead — /records
                  // has no year window, and drilling in is the more useful move anyway.
                  href={
                    view === 'monthly'
                      ? `/records?cycle=${r.key}&category=${encodeURIComponent(category)}`
                      : reportHref('monthly', Number(r.key), category)
                  }
                  aria-label={
                    view === 'monthly'
                      ? `${category} records for ${r.label} ${activeYear}`
                      : `${category} month by month in ${r.label}`
                  }
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
        {/* The rows stop at aggregates — three taps from here to an actual receipt. /records?all=1
            already spans every cycle for one category, so this is the shortcut, not a new surface.
            The count is only stated in the yearly view, where the window IS all time and the figure
            is therefore the same one the list lands on; monthly holds a single year and would be
            counting something else. */}
        <Link
          prefetch={false}
          href={`/records?all=1&category=${encodeURIComponent(category)}`}
          className="tap flex min-h-11 items-center gap-1 text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          {view === 'yearly'
            ? `See all ${rows.reduce((n, r) => n + r.count, 0)} records`
            : 'See all records'}
          <RowChevron />
        </Link>
      </section>
    ) : categories.length === 0 ? (
      <section className="panel px-6 py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {view === 'monthly' ? `Nothing recorded in ${activeYear}.` : 'Nothing recorded yet.'}
        </p>
      </section>
    ) : (
      // The picker. Its figures are the window's, so the row you tap and the headline you land on are
      // the same number.
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          {view === 'monthly' ? `Categories in ${activeYear}` : 'Categories, all time'}
        </h2>
        <ul className="flex flex-col gap-2.5">
          {categories.map((c) => (
            <li key={c.name} className="flex items-center text-sm">
              <Link
                prefetch={false}
                href={reportHref(view, activeYear, c.name)}
                aria-label={`${c.name} over time`}
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
    );

  const body = (
    <>
      {chart}
      {list}
    </>
  );

  return (
    <PageContainer size="full">
      <h1 className="sr-only">
        {heading} — {view === 'monthly' ? `month by month in ${activeYear}` : 'year by year'}
      </h1>
      {/* The stepper stays OUTSIDE SwipeNav — SwipeNav sets a transform even at rest, and a
          transformed ancestor would stop it sticking. */}
      {view === 'monthly' ? (
        <>
          <YearSelector year={activeYear} prevHref={prevHref} nextHref={nextHref} />
          <SwipeNav prevHref={prevHref} nextHref={nextHref} className="-mt-3 flex flex-col gap-6">
            {body}
          </SwipeNav>
        </>
      ) : (
        <div className="flex flex-col gap-6">{body}</div>
      )}
    </PageContainer>
  );
}
