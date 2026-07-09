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
import { LedgerTable } from '@features/entries/ui/LedgerTable';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Records = the full chronological log for the cycle (newest first). Phase 2 upgrades this to
// grouped-by-day with notes-first rows; for now it reuses LedgerTable over the whole cycle.
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
      {entries.length > 0 ? <LedgerTable entries={[...entries].reverse()} /> : <EmptyLedger />}
    </PageContainer>
  );
}
