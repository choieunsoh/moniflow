// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getCycleSummary,
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
} from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { todayIso } from '@shared/date';
import { SummaryBar } from '@features/entries/ui/SummaryBar';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { LedgerTable } from '@features/entries/ui/LedgerTable';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { FlowChart } from '@features/entries/ui/FlowChart';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);

  const activeKey = cycleParam ?? currentCycleKey(todayIso());
  const cycle = cycleFromKey(activeKey);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const entriesInCycle = getEntriesInRange(db, cycle.start, cycle.end);

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Your money flow for the {cycle.label} billing cycle.
        </p>
      </header>

      <CycleSelector activeKey={activeKey} />

      {summary.count > 0 ? (
        <>
          <SummaryBar summary={summary} />
          <div className="grid gap-6 md:grid-cols-2">
            <Breakdown
              title="By category"
              rows={getCategoryBreakdown(db, cycle.start, cycle.end)}
            />
            <Breakdown title="By account" rows={getAccountBreakdown(db, cycle.start, cycle.end)} />
          </div>
          <section className="panel p-5">
            <h2 className="mb-4 text-base font-semibold">Balance over the cycle</h2>
            <FlowChart entries={entriesInCycle} />
          </section>
          <LedgerTable entries={entriesInCycle.slice(-8).reverse()} />
        </>
      ) : (
        <EmptyLedger />
      )}
    </div>
  );
}
