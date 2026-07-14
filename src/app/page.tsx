'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { useHome } from '@features/entries/use-home';
import { pacePhrase } from '@features/budgets/budget-status';
import { BudgetMeter } from '@features/budgets/ui/BudgetMeter';
import { formatBaht } from '@shared/money';
import { emojiFor, hueFor } from '@features/categories/queries';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import { CategoryEditTrigger } from '@features/categories/ui/CategoryPicker';
import { DonutChart } from '@features/entries/ui/DonutChart';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { CycleProgress } from '@features/entries/ui/CycleProgress';
import { CycleSwipe } from '@features/entries/ui/CycleSwipe';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Home = the expense overview for the current cycle. Chart view: a spending donut with the total
// spent in the hole plus a colour-keyed legend; List view: the ranked category bars. A ?view= toggle
// switches them. Expense-only — no net/inflow figures. Cycle data loads client-side via useHome
// against the browser OPFS db (params come from useSearchParams, not a server searchParams prop).
export default function HomePage() {
  const params = useSearchParams();
  const cycleParam = params.get('cycle');
  const view = params.get('view') ?? undefined;
  const { ready, data } = useHome(cycleParam);

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

  const {
    cutoff,
    activeKey,
    canGoNext,
    isCurrentCycle,
    summary,
    categoryBreakdown,
    slices,
    total,
    emojiMap,
    hueMap,
    iconSet,
    limits,
    totalStatus,
    progress,
    pacePct,
  } = data;

  const showList = view === 'category';

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} canGoNext={canGoNext} view={view} />
      {isCurrentCycle ? <CycleProgress progress={progress} /> : null}

      {summary.count > 0 ? (
        <>
          <div className="panel flex gap-1 p-1">
            <ViewLink label="Chart" active={!showList} href={`/?cycle=${activeKey}&view=chart`} />
            <ViewLink label="List" active={showList} href={`/?cycle=${activeKey}&view=category`} />
          </div>

          <CycleSwipe activeKey={activeKey} canGoNext={canGoNext}>
            {showList ? (
              <Breakdown
                title="Spending by category"
                rows={categoryBreakdown}
                emojis={emojiMap}
                hues={hueMap}
                iconSet={iconSet}
                limits={limits}
                pacePct={pacePct}
                cycleKey={activeKey}
              />
            ) : (
              <section className="panel flex flex-col gap-5 p-5">
                <DonutChart rows={categoryBreakdown} />
                {totalStatus ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span style={{ color: 'var(--color-muted)' }}>Total budget</span>
                      <span className="tnum" style={{ color: 'var(--color-text)' }}>
                        {formatBaht(total)} / {formatBaht(totalStatus.limit ?? 0)}
                      </span>
                    </div>
                    <BudgetMeter status={totalStatus} pacePct={pacePct} />
                    {pacePct !== undefined && totalStatus.state !== 'over' ? (
                      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                        {pacePhrase(totalStatus.pct, pacePct)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <ul className="flex flex-col gap-2.5">
                  {slices.map((s) => (
                    <li key={s.name} className="flex items-center gap-3 text-sm">
                      {/* Slice colour + category icon combined into one mark: a disc in the ring's
                        colour with the icon inside (white line icons / emoji on the colour). Tap a
                        real category to edit it — the disc keeps its slice colour, the dialog edits
                        the category's own hue. The synthetic "Other" bucket isn't editable. */}
                      {(() => {
                        const disc = (
                          <span
                            aria-hidden
                            className="grid size-7 shrink-0 place-items-center rounded-full text-base"
                            style={{ background: s.color, color: 'var(--color-on-accent)' }}
                          >
                            <CategoryGlyph
                              emoji={emojiFor(emojiMap, s.name)}
                              iconSet={iconSet}
                              size={18}
                            />
                          </span>
                        );
                        return s.other ? (
                          disc
                        ) : (
                          <CategoryEditTrigger
                            category={s.name}
                            emoji={emojiFor(emojiMap, s.name)}
                            hue={hueFor(hueMap, s.name)}
                          >
                            {disc}
                          </CategoryEditTrigger>
                        );
                      })()}
                      {/* Icon-excepted tap-through to the category's filtered records for this
                        cycle. The synthetic "Other" bucket isn't a real category — no records match
                        it — so it stays static. */}
                      {(() => {
                        const inner = (
                          <>
                            <span className="flex min-w-0 flex-1 items-baseline gap-1">
                              <span className="truncate">{s.name}</span>
                              <span
                                className="tnum shrink-0"
                                style={{ color: 'var(--color-muted)' }}
                              >
                                ({s.count})
                              </span>
                            </span>
                            <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                              {formatBaht(s.value)}
                            </span>
                            <span
                              className="tnum w-9 shrink-0 text-right"
                              style={{ color: 'var(--color-faint)' }}
                            >
                              {Math.round((s.value / total) * 100)}%
                            </span>
                          </>
                        );
                        return s.other ? (
                          <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
                        ) : (
                          <Link
                            href={`/records?cycle=${activeKey}&category=${encodeURIComponent(s.name)}`}
                            aria-label={`${s.name} records this cycle`}
                            className="flex min-w-0 flex-1 items-center gap-3"
                          >
                            {inner}
                          </Link>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CycleSwipe>
        </>
      ) : (
        <CycleSwipe activeKey={activeKey} canGoNext={canGoNext}>
          <EmptyLedger />
        </CycleSwipe>
      )}
    </PageContainer>
  );
}

function ViewLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="flex-1 rounded-[var(--radius-md)] py-2 text-center text-sm font-medium transition-colors duration-150"
      style={{
        background: active ? 'var(--color-accent-soft)' : 'transparent',
        color: active ? 'var(--color-accent-text)' : 'var(--color-muted)',
      }}
    >
      {label}
    </Link>
  );
}
