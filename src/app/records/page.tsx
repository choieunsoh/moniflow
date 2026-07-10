export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getEntriesInRange,
  searchEntries,
  getDistinctCategories,
  getDistinctAccounts,
} from '@features/entries/queries';
import { groupByDate } from '@features/entries/by-date';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff, getIconSet } from '@features/settings/queries';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap, hueFor } from '@features/categories/queries';
import { todayIso, formatDayHeading } from '@shared/date';
import { formatBaht } from '@shared/money';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { SearchBox } from '@features/entries/ui/SearchBox';
import { SwipeRow } from '@features/entries/ui/SwipeRow';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Records = the cycle's expenses grouped by day, newest first. Each day is a light header (date +
// day total) over a panel of rows; each row swipes to reveal Edit / Delete.
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string; category?: string; account?: string; q?: string }>;
}) {
  const { cycle: cycleParam, category, account, q } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);
  ensureCategoryMetaTable(db);
  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const iconSet = getIconSet(db);

  // Autocomplete pool: distinct categories + accounts, de-duped and sorted for the <datalist>.
  const query = (q ?? '').trim();
  const searching = query.length > 0;
  const suggestions = [
    ...new Set([...getDistinctCategories(db), ...getDistinctAccounts(db)]),
  ].sort();

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
  const inCycle = getEntriesInRange(db, cycle.start, cycle.end);
  // Tap-a-chip filters by category and/or account, scoped to the current cycle.
  const cycleEntries = inCycle.filter(
    (e) => (!category || e.category === category) && (!account || e.account === account),
  );
  const filtered = Boolean(category || account);

  // In search mode the view spans all cycles (search results are already newest-first); otherwise
  // it's the active cycle. Both render as the same day-grouped SwipeRow list below.
  const entries = searching ? searchEntries(db, query) : cycleEntries;
  const days = groupByDate(searching ? entries : [...entries].reverse());
  const total = entries.reduce((sum, e) => sum + e.amount, 0);

  return (
    <PageContainer size="full">
      <SearchBox query={query} suggestions={suggestions} />
      {!searching && <CycleSelector activeKey={activeKey} cutoff={cutoff} />}

      {days.length > 0 ? (
        <div className="flex flex-col gap-5">
          {/* Summary of the current view (respects the active filter / search). */}
          <div className="flex items-baseline justify-between px-1">
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {entries.length}{' '}
              {searching
                ? entries.length === 1
                  ? 'result'
                  : 'results'
                : entries.length === 1
                  ? 'entry'
                  : 'entries'}
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
                    iconSet={iconSet}
                    hue={hueFor(hueMap, entry.category)}
                  />
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-center text-xs" style={{ color: 'var(--color-faint)' }}>
            Swipe a row left to delete · right to edit
          </p>
        </div>
      ) : searching ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No records match “{query}”.
          </p>
          <Link
            href="/records"
            className="text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            Clear search
          </Link>
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
