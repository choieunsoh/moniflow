'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageContainer } from '@shared/ui/PageContainer';
import { useYear } from '@features/entries/use-year';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { TopNotesList } from '@features/entries/ui/TopNotesList';
import { WeekdayCard } from '@features/entries/ui/WeekdayCard';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBaht, formatBahtWhole } from '@shared/money';
import { formatDayHeadingWithYear } from '@shared/date';

// The /year recap — a trailing-12-cycle "where did it go" summary reached from the More sheet. All
// figures come from useYear (one windowed query, folded by yearSummary). Reuses TrendChart /
// TopNotesList / WeekdayCard / CategoryIcon so it reads as the same app, not a second dialect.
const TOP_CATEGORY_ROWS = 8;

export default function YearPage() {
  const { ready, data } = useYear(useSearchParams().get('cycle'));

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
    emojiMap,
    hueMap,
    iconSet,
  } = data;

  if (categories.length === 0) {
    return (
      <PageContainer size="full">
        <h1 className="sr-only">Year in review</h1>
        <EmptyLedger />
      </PageContainer>
    );
  }

  const last = bars[bars.length - 1];
  const windowLabel = `${bars[0].label} – ${last.label} ${last.key.split('-')[0]}`;

  return (
    <PageContainer size="full">
      <h1 className="sr-only">Year in review</h1>

      <section className="panel flex flex-col gap-5 p-5">
        <header className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-base font-semibold">Year in review</h2>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {windowLabel}
            </span>
          </div>
          <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
        </header>
        <TrendChart bars={bars} budget={null} label="Spending over the last 12 cycles" />
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
        <TopNotesList notes={topNotes} label="Top notes over the last 12 cycles" />
      </div>
    </PageContainer>
  );
}
