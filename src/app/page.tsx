// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCycleSummary, getCategoryBreakdown } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey, cycleProgress } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff, getIconSet } from '@features/settings/queries';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { getBudgets } from '@features/budgets/queries';
import { toBudgetTotal } from '@features/budgets/budget-status';
import { BudgetMeter } from '@features/budgets/ui/BudgetMeter';
import { todayIso } from '@shared/date';
import { formatBaht } from '@shared/money';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap } from '@features/categories/queries';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import { toDonutSlices } from '@features/entries/donut';
import { DonutChart } from '@features/entries/ui/DonutChart';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { CycleProgress } from '@features/entries/ui/CycleProgress';
import { CycleSwipe } from '@features/entries/ui/CycleSwipe';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Home = the expense overview for the current cycle. Chart view: a spending donut with the total
// spent in the hole plus a colour-keyed legend; List view: the ranked category bars. A ?view= toggle
// switches them. Expense-only — no net/inflow figures.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; view?: string }>;
}) {
  const { cycle: cycleParam, view } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);
  ensureCategoryMetaTable(db);
  ensureBudgetsTable(db);
  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const iconSet = getIconSet(db);

  const cutoff = getCutoff(db);
  const currentKey = currentCycleKey(todayIso(), cutoff);
  const activeKey = cycleParam ?? currentKey;
  // No future cycles to spend in yet — cap forward navigation at today's cycle.
  const canGoNext = activeKey < currentKey;
  const isCurrentCycle = activeKey === currentKey;
  const cycle = cycleFromKey(activeKey, cutoff);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const categoryBreakdown = getCategoryBreakdown(db, cycle.start, cycle.end);

  const showList = view === 'category';
  const slices = toDonutSlices(categoryBreakdown);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  // Standing budgets: the category=null row is the whole-cycle total; the rest are per-category
  // caps keyed by name. Spend magnitudes come straight from the category breakdown (totals are
  // negative — take the abs).
  const budgetRows = getBudgets(db);
  const totalLimit = budgetRows.find((b) => b.category === null)?.amount ?? null;
  const limits = new Map<string, number>();
  for (const b of budgetRows) {
    if (b.category !== null) limits.set(b.category, b.amount);
  }
  const totalStatus = totalLimit === null ? null : toBudgetTotal(totalLimit, total);

  // Time elapsed in the cycle drives both the standalone header bar and the "today" pace tick on the
  // budget meters — but a pace mark only makes sense while the cycle is live, so pacePct is undefined
  // on a past cycle (no tick), matching the header bar hiding there.
  const progress = cycleProgress(cycle, todayIso());
  const pacePct = isCurrentCycle ? (progress.day / progress.total) * 100 : undefined;

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} canGoNext={canGoNext} />
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
                  </div>
                ) : null}
                <ul className="flex flex-col gap-2.5">
                  {slices.map((s) => (
                    <li key={s.name} className="flex items-center gap-3 text-sm">
                      {/* Slice colour + category icon combined into one mark: a disc in the ring's
                        colour with the icon inside (white line icons / emoji on the colour). */}
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
                      <span className="flex min-w-0 flex-1 items-baseline gap-1">
                        <span className="truncate">{s.name}</span>
                        <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
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
