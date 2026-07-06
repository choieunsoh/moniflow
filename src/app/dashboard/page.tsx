// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getSummary, getRecentEntries, getEntries } from '@features/entries/queries';
import { SummaryBar } from '@features/entries/ui/SummaryBar';
import { LedgerTable } from '@features/entries/ui/LedgerTable';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { FlowChart } from '@features/entries/ui/FlowChart';

export default function DashboardPage() {
  const db = initDb();
  ensureEntriesTable(db);
  const summary = getSummary(db);

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Where your money went, and whether you&rsquo;re net up.
        </p>
      </header>

      {summary.count > 0 ? (
        <>
          <SummaryBar summary={summary} />
          <section className="panel p-5">
            <h2 className="mb-4 text-base font-semibold">Balance over time</h2>
            <FlowChart entries={getEntries(db)} />
          </section>
          <LedgerTable entries={getRecentEntries(db, 8)} />
        </>
      ) : (
        <EmptyLedger />
      )}
    </div>
  );
}
