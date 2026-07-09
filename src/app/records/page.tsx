export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getEntriesInRange } from '@features/entries/queries';
import { groupByDate } from '@features/entries/by-date';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor } from '@features/categories/queries';
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
  searchParams: Promise<{ cycle?: string; category?: string; account?: string }>;
}) {
  const { cycle: cycleParam, category, account } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);
  ensureCategoryMetaTable(db);
  const emojiMap = getEmojiMap(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const inCycle = getEntriesInRange(db, cycle.start, cycle.end);
  // Tap-a-chip filters by category and/or account, scoped to the current cycle.
  const entries = inCycle.filter(
    (e) => (!category || e.category === category) && (!account || e.account === account),
  );
  const filtered = Boolean(category || account);
  const days = groupByDate([...entries].reverse());
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <PageContainer size="full">
      <CycleSelector activeKey={activeKey} cutoff={cutoff} />

      {days.length > 0 ? (
        <div className="flex flex-col gap-5">
          {/* Summary of the current view (respects the active filter). */}
          <div className="flex items-baseline justify-between px-1">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
            </span>
            <span className="tnum text-sm font-semibold">{formatBaht(Math.abs(total))}</span>
          </div>
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
                  <SwipeRow
                    key={entry.id}
                    entry={entry}
                    emoji={emojiFor(emojiMap, entry.category)}
                  />
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-center text-xs" style={{ color: 'var(--color-faint)' }}>
            Swipe a row left to delete · right to edit
          </p>
        </div>
      ) : filtered ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No entries match this filter in this cycle.
          </p>
          <Link
            href={`/records?cycle=${activeKey}`}
            className="text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            Clear filter
          </Link>
        </div>
      ) : (
        <EmptyLedger />
      )}
    </PageContainer>
  );
}
