export const dynamic = 'force-dynamic';

import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getEntriesInRange } from '@features/entries/queries';
import { groupByDate } from '@features/entries/by-date';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso, formatDayHeading } from '@shared/date';
import { formatBaht } from '@shared/money';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { SwipeRow } from '@features/entries/ui/SwipeRow';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Records = the cycle's expenses grouped by day, newest first. Each day is a light header (date +
// day total) over a panel of rows; each row swipes to reveal Edit / Delete.
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
  const days = groupByDate([...entries].reverse());

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} />
      {days.length > 0 ? (
        <div className="flex flex-col gap-5">
          {days.map((day) => (
            <section key={day.date} className="flex flex-col gap-2">
              <header className="flex items-baseline justify-between px-1">
                <h2 className="text-sm font-semibold">{formatDayHeading(day.date)}</h2>
                <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                  {day.entries.length} · {formatBaht(Math.abs(day.total))}
                </span>
              </header>
              <ul className="panel flex flex-col divide-y overflow-hidden">
                {day.entries.map((entry) => (
                  <SwipeRow key={entry.id} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-center text-xs" style={{ color: 'var(--color-faint)' }}>
            Swipe a row left to delete · right to edit
          </p>
        </div>
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
