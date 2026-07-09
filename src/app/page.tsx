// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCycleSummary, getCategoryBreakdown } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { formatBaht } from '@shared/money';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Home = the expense overview for the current cycle: a total-spent hero, cycle nav, and the top
// spending categories. Expense-only — no net/inflow figures. The donut + view toggle land in phase 2.
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const categoryBreakdown = getCategoryBreakdown(db, cycle.start, cycle.end);
  const spent = Math.abs(summary.outflow);

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} />

      {summary.count > 0 ? (
        <>
          <section className="panel flex flex-col items-center gap-1 px-6 py-8 text-center">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              Spent this cycle
            </span>
            <span className="tnum text-4xl font-semibold" style={{ color: 'var(--color-loss)' }}>
              {formatBaht(spent)}
            </span>
            <span className="tnum text-sm" style={{ color: 'var(--color-faint)' }}>
              {new Intl.NumberFormat('en-US').format(summary.count)} entries
            </span>
          </section>
          <Breakdown title="Top categories" rows={categoryBreakdown.slice(0, 8)} />
        </>
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
