'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { ViewToggle } from '@shared/ui/ViewToggle';
import { useAnalytics } from '@features/entries/use-analytics';
import { TrendChart } from '@features/entries/ui/TrendChart';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import { emojiFor } from '@features/categories/queries';
import { meterColorVar, type BudgetFitRow } from '@features/budgets/budget-status';
import { formatBahtWhole } from '@shared/money';

// Analytics = the zoom-out surface. Home answers "what did I spend this cycle"; this answers "is that
// normal for me". Two views on a ?view= param: the six-cycle spending trend (default), and how the
// budgets set NOW would have fared across those cycles. The window is anchored to ?cycle= so it stays
// consistent with the cycle the rest of the app is showing.
export default function AnalyticsPage() {
  const params = useSearchParams();
  const cycleParam = params.get('cycle');
  const category = params.get('category');
  const view = params.get('view') ?? undefined;
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

  const { activeKey, bars, slices, total, emojiMap, iconSet, fitRows, budgetLine } = data;
  const showBudgets = view === 'budgets';
  const base = `/analytics?cycle=${activeKey}`;

  return (
    <PageContainer size="full">
      <ViewToggle
        options={[
          { label: 'Trend', active: !showBudgets, href: `${base}&view=trend` },
          { label: 'Budgets', active: showBudgets, href: `${base}&view=budgets` },
        ]}
      />

      {showBudgets ? (
        <section className="panel flex flex-col gap-5 p-5">
          <header className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Budget fit</h2>
            {/* Fixed copy — budgets are standing, so this view cannot know what a past cycle's
              limit was. Saying so is the whole honesty of the view. Do not reword. */}
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Against your current limits.
            </p>
          </header>
          {fitRows.length > 0 ? (
            <ul className="flex flex-col gap-4">
              {fitRows.map((row) => (
                <FitRow key={row.category} row={row} />
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              No budgets set yet.
            </p>
          )}
        </section>
      ) : (
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
              <HeaderFilterChip href={`${base}&view=trend`} active label={category} />
            </div>
          ) : null}

          <TrendChart
            bars={bars}
            limit={budgetLine}
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
                      href={`${base}&view=trend&category=${encodeURIComponent(s.name)}`}
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
      )}
    </PageContainer>
  );
}

// One budgeted category: its limit, how many cycles would have held, and a mini bar per cycle scaled
// to the worst cycle in the row. Pure CSS bars — BudgetMeter already proves this needs no chart.
function FitRow({ row }: { row: BudgetFitRow }) {
  const peak = Math.max(row.limit, ...row.cycles.map((c) => c.spent));
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{row.category}</span>
        <span className="tnum shrink-0 text-xs" style={{ color: 'var(--color-muted)' }}>
          {row.heldCount} of {row.cycles.length} cycles would have held ·{' '}
          {formatBahtWhole(row.limit)}
        </span>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 44 }}>
        {row.cycles.map((c) => (
          <div key={c.key} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-[3px]"
              style={{
                height: `${peak > 0 ? Math.max(2, (c.spent / peak) * 32) : 2}px`,
                background: meterColorVar(c.over ? 'over' : 'under'),
                opacity: c.over ? 1 : 0.55,
              }}
              title={`${c.label}: ${formatBahtWhole(c.spent)}`}
            />
            <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}
