// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCycleSummary, getCategoryBreakdown } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff, getIconSet } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { formatBaht } from '@shared/money';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap } from '@features/categories/queries';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import { toDonutSlices } from '@features/entries/donut';
import { DonutChart } from '@features/entries/ui/DonutChart';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
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
  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const iconSet = getIconSet(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const categoryBreakdown = getCategoryBreakdown(db, cycle.start, cycle.end);

  const showList = view === 'category';
  const slices = toDonutSlices(categoryBreakdown);
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} />

      {summary.count > 0 ? (
        <>
          <div className="panel flex gap-1 p-1">
            <ViewLink label="Chart" active={!showList} href={`/?cycle=${activeKey}&view=chart`} />
            <ViewLink label="List" active={showList} href={`/?cycle=${activeKey}&view=category`} />
          </div>

          {showList ? (
            <Breakdown
              title="Spending by category"
              rows={categoryBreakdown}
              emojis={emojiMap}
              hues={hueMap}
              iconSet={iconSet}
            />
          ) : (
            <section className="panel flex flex-col gap-5 p-5">
              <DonutChart rows={categoryBreakdown} />
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
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
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
        </>
      ) : (
        <EmptyLedger />
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
