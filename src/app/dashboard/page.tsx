// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getCycleSummary,
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
} from '@features/entries/queries';
import { cycleFromKey, currentCycleKey, cycleProgress } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { SummaryBar } from '@features/entries/ui/SummaryBar';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { CycleProgress } from '@features/entries/ui/CycleProgress';
import { LedgerTable } from '@features/entries/ui/LedgerTable';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { FlowChart } from '@features/entries/ui/FlowChart';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { getBudgets } from '@features/budgets/queries';
import { toBudgetRows, totalBudgetRow } from '@features/budgets/budget';
import { BudgetTracker } from '@features/budgets/ui/BudgetTracker';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureBudgetsTable(db);
  ensureSettingsTable(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const entriesInCycle = getEntriesInRange(db, cycle.start, cycle.end);
  const categoryBreakdown = getCategoryBreakdown(db, cycle.start, cycle.end);
  const progress = cycleProgress(cycle, todayIso());
  const progressPct = (progress.day / progress.total) * 100;
  const budgets = getBudgets(db);
  const budgetRows = toBudgetRows(categoryBreakdown, budgets, progressPct);
  const total = totalBudgetRow(Math.abs(summary.outflow), budgets, progressPct);

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Your money flow for the {cycle.label} billing cycle.
          </p>
        </div>
        <Link href="/entries/new" className="btn btn-primary">
          ＋ Add entry
        </Link>
      </header>

      <CycleSelector activeKey={activeKey} cutoff={cutoff} />
      <CycleProgress progress={progress} />

      {summary.count > 0 ? (
        <>
          <SummaryBar summary={summary} />
          <BudgetTracker rows={budgetRows} total={total} />
          <div className="grid gap-6 md:grid-cols-2">
            <Breakdown title="By category" rows={categoryBreakdown} />
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
