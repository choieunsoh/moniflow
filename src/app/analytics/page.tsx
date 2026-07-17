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

// Analytics = the zoom-out surface. Home answers "what did I spend this cycle"; this answers "is that
// normal for me". One screen: the six-cycle spending trend, with a dashed line marking your own
// average across the window (see trendAverage), and the category breakdown for the window below
// it. The window is anchored to ?cycle= so it stays consistent with the cycle the rest of the app
// is showing; ?category= narrows the trend and breakdown to one category.
export default function AnalyticsPage() {
  const params = useSearchParams();
  const cycleParam = params.get('cycle');
  const category = params.get('category');
  const { ready, data } = useAnalytics(cycleParam, category);

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  const { activeKey, bars, slices, total, emojiMap, iconSet } = data;
  const base = `/analytics?cycle=${activeKey}`;

  return (
    <PageContainer size="full">
      <section className="panel flex flex-col gap-5 p-5">
        <header className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="truncate text-base font-semibold">{category ?? 'All spending'}</h2>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Last {bars.length} cycles
            </span>
          </div>
          <span className="tnum shrink-0 text-lg font-semibold">{formatBahtWhole(total)}</span>
        </header>

        {category !== null ? (
          <div className="flex">
            <HeaderFilterChip href={base} active label={category} />
          </div>
        ) : null}

        <TrendChart
          bars={bars}
          label={`${category ?? 'Total'} spending over the last ${bars.length} cycles`}
        />

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
      </section>
    </PageContainer>
  );
}
