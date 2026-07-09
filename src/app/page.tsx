// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getCycleSummary,
  getCategoryBreakdown,
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

// Home = the mobile at-a-glance overview (absorbs the old /dashboard): current cycle nav, the four
// summary figures, cycle progress, the top categories, and the most recent entries. The full chart,
// account breakdown and full ledger were deliberately cut (see the design spec). On desktop the
// header carries an Add button; on mobile the bottom-bar FAB does, so the header button is sm-only.
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
  const entriesInCycle = getEntriesInRange(db, cycle.start, cycle.end);
  const categoryBreakdown = getCategoryBreakdown(db, cycle.start, cycle.end);
  const progress = cycleProgress(cycle, todayIso());

  return (
    <PageContainer size="full">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Your money flow for the {cycle.label} cycle.
          </p>
        </div>
        {/* Desktop-only: on mobile the bottom-bar FAB covers add. `hidden` must sit on a plain
            wrapper, not the .btn — .btn is unlayered CSS and its display beats Tailwind's layered
            .hidden, so `btn hidden` would still show. */}
        <div className="hidden sm:block">
          <Link href="/entries/new" className="btn btn-primary">
            ＋ Add entry
          </Link>
        </div>
      </header>

      <CycleSelector activeKey={activeKey} cutoff={cutoff} />

      {summary.count > 0 ? (
        <>
          <SummaryBar summary={summary} />
          <CycleProgress progress={progress} />
          <Breakdown title="Top categories" rows={categoryBreakdown.slice(0, 5)} />
          <LedgerTable entries={entriesInCycle.slice(-5).reverse()} />
        </>
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
