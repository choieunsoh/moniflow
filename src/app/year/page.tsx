'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { useYear } from '@features/entries/use-year';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { TopNotesList } from '@features/entries/ui/TopNotesList';
import { WeekdayCard } from '@features/entries/ui/WeekdayCard';
import { YearSelector } from '@features/entries/ui/YearSelector';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBaht, formatBahtWhole } from '@shared/money';
import { formatDayHeadingWithYear } from '@shared/date';

// The /year recap — a calendar-year "where did it go" summary reached from the More sheet, stepped
// with ?year=. All figures come from useYear (one windowed query, folded by yearSummary). Reuses
// TrendChart / TopNotesList / WeekdayCard / CategoryIcon so it reads as the same app, not a second
// dialect.
//
// The year is CYCLE-aligned, so it runs 18 Jan → 17 Jan (see cyclesInYear) and the current year
// stops at the live cycle. That is why the header prints the window's real span underneath the
// year: '2026' alone would imply a 1 Jan start the ledger does not have.
const TOP_CATEGORY_ROWS = 8;

export default function YearPage() {
  const param = useSearchParams().get('year');
  // A junk or missing ?year= means "no opinion" — the hook then defaults to the current year and
  // clamps anything out of range, so nothing here has to guard the bounds.
  const requested = param === null ? null : Number(param);
  const { ready, data } = useYear(requested === null || Number.isNaN(requested) ? null : requested);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Year in review</h1>
        <p className="p-8 text-center" style={{ color: 'var(--color-muted)' }}>
          …
        </p>
      </PageContainer>
    );
  }

  const {
    total,
    bars,
    categories,
    biggestMonth,
    biggestTransaction,
    topNotes,
    weekday,
    avgPerCycle,
    year,
    currentYear,
    firstYear,
    rangeLabel,
    emojiMap,
    hueMap,
    iconSet,
  } = data;

  // Only a ledger with nothing in it at all earns the onboarding screen. An empty YEAR is now
  // reachable by stepping, and swapping the page for EmptyLedger there would both cry data loss and
  // strand you — the stepper is the only way back out.
  if (firstYear === null) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Year in review</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  const header = (
    <header className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        {/* -ml-3 pulls the chevron's 44px tap target back so the glyph, not its padding, lines up
            with the panel's edge and the total opposite it. */}
        <div className="-ml-3">
          <YearSelector year={year} firstYear={firstYear} currentYear={currentYear} />
        </div>
        <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
      </div>
      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {rangeLabel}
      </span>
    </header>
  );

  if (categories.length === 0) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Year in review — {year}</h1>
        <section className="panel flex flex-col gap-5 p-5">
          {header}
          <p className="py-6 text-center text-sm" style={{ color: 'var(--color-muted)' }}>
            Nothing recorded in {year}.
          </p>
        </section>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="full">
      <h1 className="sr-only">Year in review — {year}</h1>

      <section className="panel flex flex-col gap-5 p-5">
        {header}
        <TrendChart bars={bars} budget={null} label={`Spending in ${year}`} />
      </section>

      <div className="grid grid-cols-2 gap-3">
        <div className="panel flex flex-col gap-1 p-4">
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Biggest month
          </span>
          {biggestMonth === null ? (
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              —
            </span>
          ) : (
            <>
              <span className="tnum text-lg font-semibold">
                {formatBahtWhole(biggestMonth.value)}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {biggestMonth.label}
              </span>
            </>
          )}
        </div>
        <div className="panel flex flex-col gap-1 p-4">
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Average / cycle
          </span>
          <span className="tnum text-lg font-semibold">
            {avgPerCycle === null ? '—' : formatBahtWhole(avgPerCycle)}
          </span>
        </div>
      </div>

      {biggestTransaction !== null ? (
        <section className="panel flex flex-col gap-3 p-5" aria-label="Biggest single purchase">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
            Biggest purchase
          </h2>
          <Link
            prefetch={false}
            href={`/entries/edit?id=${biggestTransaction.id}`}
            aria-label={`${biggestTransaction.note ? `${biggestTransaction.note} (${biggestTransaction.category})` : biggestTransaction.category} ${formatBaht(Math.abs(biggestTransaction.amount))} on ${formatDayHeadingWithYear(biggestTransaction.date)}`}
            className="flex min-h-11 items-center gap-3 text-sm"
          >
            <CategoryIcon
              emoji={emojiFor(emojiMap, biggestTransaction.category)}
              name={biggestTransaction.category}
              hue={hueFor(hueMap, biggestTransaction.category)}
              iconSet={iconSet}
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">
                {biggestTransaction.note ? biggestTransaction.note : biggestTransaction.category}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {formatDayHeadingWithYear(biggestTransaction.date)}
              </span>
            </span>
            <span className="tnum shrink-0" style={{ color: 'var(--color-text)' }}>
              {formatBaht(Math.abs(biggestTransaction.amount))}
            </span>
          </Link>
        </section>
      ) : null}

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          Top categories
        </h2>
        <ul className="flex flex-col gap-2.5">
          {categories.slice(0, TOP_CATEGORY_ROWS).map((c) => (
            <li key={c.name} className="flex items-center gap-3 text-sm">
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
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-3">
        <WeekdayCard stats={weekday} />
        <TopNotesList notes={topNotes} label={`Top notes in ${year}`} />
      </div>
    </PageContainer>
  );
}
