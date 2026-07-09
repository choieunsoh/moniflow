export const dynamic = 'force-dynamic';

import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getEntriesInRange } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { SwipeRow } from '@features/entries/ui/SwipeRow';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Records = the full chronological log for the cycle (newest first). Each row swipes to reveal
// Edit / Delete. Phase 2 upgrades this to grouped-by-day with notes-first rows.
export default async function RecordsPage({
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
  const entries = getEntriesInRange(db, cycle.start, cycle.end);

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} />
      {entries.length > 0 ? (
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between px-4 py-4">
            <h2 className="text-base font-semibold">Records</h2>
            <span className="chip">{entries.length}</span>
          </div>
          <ul className="flex flex-col">
            {[...entries].reverse().map((entry) => (
              <SwipeRow key={entry.id} entry={entry} />
            ))}
          </ul>
          <p className="px-4 py-3 text-center text-xs" style={{ color: 'var(--color-faint)' }}>
            Swipe a row left to delete · right to edit
          </p>
        </section>
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
