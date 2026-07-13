export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getEntriesInRange,
  searchEntries,
  getEntriesByCategory,
  getTripEntries,
} from '@features/entries/queries';
import { groupByDate } from '@features/entries/by-date';
import { groupByCategory } from '@features/entries/by-category';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { formatDateRange, formatForeign, sumByCurrency } from '@features/entries/trips';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff, getIconSet } from '@features/settings/queries';
import { ensureCategoriesTable } from '@features/categories/schema';
import { getEmojiMap, emojiFor, getHueMap, hueFor } from '@features/categories/queries';
import { todayIso, formatDayHeading, formatDayHeadingWithYear } from '@shared/date';
import { formatBaht } from '@shared/money';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { CollapseAllButton } from '@features/entries/ui/CollapseAllButton';
import { SwipeRow } from '@features/entries/ui/SwipeRow';
import { CategoryIconButton } from '@features/categories/ui/CategoryPicker';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Records = the cycle's expenses grouped by day, newest first. Each day is a light header (date +
// day total) over a panel of rows; each row swipes to reveal Edit / Delete.
export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cycle?: string;
    category?: string;
    account?: string;
    q?: string;
    view?: string;
    all?: string;
    currency?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const {
    cycle: cycleParam,
    category,
    account,
    q,
    view,
    all,
    currency,
    from,
    to,
  } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);
  ensureCategoriesTable(db);
  const emojiMap = getEmojiMap(db);
  const hueMap = getHueMap(db);
  const iconSet = getIconSet(db);

  // Search box now lives in the header (layout); this page just reads ?q= and renders the results.
  const query = (q ?? '').trim();
  const searching = query.length > 0;

  const cutoff = getCutoff(db);
  const currentKey = currentCycleKey(todayIso(), cutoff);
  const activeKey = cycleParam ?? currentKey;
  const canGoNext = activeKey < currentKey; // cap forward navigation at today's cycle
  const cycle = cycleFromKey(activeKey, cutoff);
  const inCycle = getEntriesInRange(db, cycle.start, cycle.end);
  // Tap-a-chip filters by category and/or account. Applied to whichever set is on screen.
  const applyChips = (rows: typeof inCycle) =>
    rows.filter(
      (e) => (!category || e.category === category) && (!account || e.account === account),
    );
  const cycleEntries = applyChips(inCycle);
  const filtered = Boolean(category || account);

  // Trip mode: opened from a Trips card — one foreign currency within its date range, across cycles.
  const tripMode = Boolean(currency && from && to);
  const tripEntries =
    currency && from && to ? applyChips(getTripEntries(db, currency, from, to)) : [];

  // Two modes span ALL cycles (rows already newest-first): text search, and the /categories count
  // link (?all=1&category=) which wants every record in a category, not just this cycle. Everything
  // else is the active cycle. All three render as the same SwipeRow list below, grouped by day
  // (default) or by category via ?view=category.
  const allCategory = !searching && !tripMode && all === '1' && Boolean(category);
  const spanAll = searching || allCategory || tripMode;
  const entries = searching
    ? searchEntries(db, query)
    : tripMode
      ? tripEntries
      : allCategory && category
        ? getEntriesByCategory(db, category)
        : cycleEntries;
  const ordered = spanAll ? entries : [...entries].reverse(); // newest first
  const byCategory = view === 'category';
  // Each section carries its own foreign-currency subtotals so a date header (by-date) or a category
  // header (by-category) can read "¥12,000  ฿2,800" when it holds foreign spending — empty otherwise.
  const sections = byCategory
    ? groupByCategory(ordered).map((g) => ({
        key: g.category,
        entries: g.entries,
        total: g.total,
        foreign: sumByCurrency(g.entries),
      }))
    : groupByDate(ordered).map((g) => ({
        key: g.date,
        entries: g.entries,
        total: g.total,
        foreign: sumByCurrency(g.entries),
      }));
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  // Foreign-currency subtotals for the current view (empty when everything is THB), shown next to
  // the THB total so a cycle with a Tokyo week reads "¥84,948  ฿17,000", not THB alone.
  const currencySums = sumByCurrency(entries);

  // Toggle links preserve the current cycle/search/filter and only flip ?view=.
  const viewHref = (next: 'date' | 'category') => {
    const params = new URLSearchParams();
    if (searching) params.set('q', query);
    else if (tripMode && currency && from && to) {
      params.set('currency', currency);
      params.set('from', from);
      params.set('to', to);
    } else if (allCategory) params.set('all', '1');
    else params.set('cycle', activeKey);
    if (category) params.set('category', category);
    if (account) params.set('account', account);
    if (next === 'category') params.set('view', 'category');
    return `/records?${params.toString()}`;
  };

  return (
    <PageContainer size="full">
      {!spanAll && (
        <CycleSelector
          activeKey={activeKey}
          cutoff={cutoff}
          canGoNext={canGoNext}
          view={byCategory ? 'category' : undefined}
        />
      )}

      {tripMode && currency && from && to && (
        <div className="flex flex-col gap-3">
          <Link
            href="/trips"
            className="tap inline-flex w-fit items-center gap-1 text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            <BackArrow />
            Trips
          </Link>
          <div className="flex items-center justify-between gap-2">
            <span className="chip">{currency}</span>
            <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {formatDateRange(from, to)}
            </span>
          </div>
        </div>
      )}

      {sections.length > 0 ? (
        <div className="flex flex-col gap-5">
          {/* Group-by toggle — flips the same entries between day and category sections. */}
          <div className="panel flex gap-1 p-1">
            <ViewLink label="By date" active={!byCategory} href={viewHref('date')} />
            <ViewLink label="By category" active={byCategory} href={viewHref('category')} />
          </div>
          {/* Summary of the current view (respects the active filter / search). */}
          <div className="flex items-baseline justify-between px-1">
            <span className="flex items-baseline gap-3">
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
              {sections.length > 1 ? <CollapseAllButton /> : null}
            </span>
            <span className="flex items-baseline gap-2">
              {currencySums.map((c) => (
                <span
                  key={c.currency}
                  className="tnum text-sm"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {formatForeign(c.total, c.currency)}
                </span>
              ))}
              <span className="tnum text-sm font-semibold">{formatBaht(Math.abs(total))}</span>
            </span>
          </div>
          {sections.map((section) => (
            // Native <details> = tap the header to collapse/expand, no JS. Collapsed by default;
            // the open/closed state is DOM-local and resets when a param re-renders the page.
            <details key={section.key} data-records-section className="flex flex-col gap-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-1 [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Chevron />
                  {byCategory ? (
                    <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                      <CategoryIconButton
                        category={section.key}
                        emoji={emojiFor(emojiMap, section.key)}
                        iconSet={iconSet}
                        hue={hueFor(hueMap, section.key)}
                        size="sm"
                      />
                      <span className="truncate">{section.key}</span>
                    </h2>
                  ) : (
                    <h2 className="truncate text-sm font-semibold">
                      {spanAll
                        ? formatDayHeadingWithYear(section.key)
                        : formatDayHeading(section.key)}
                    </h2>
                  )}
                  {/* Entry count sits next to the title (date or category); total stays right. */}
                  <span className="tnum shrink-0 text-sm" style={{ color: 'var(--color-muted)' }}>
                    ({section.entries.length})
                  </span>
                </div>
                {/* THB in the default ink; foreign currencies muted so THB stays the anchor figure. */}
                <span className="tnum flex shrink-0 items-baseline gap-2 text-sm">
                  {section.foreign.map((c) => (
                    <span key={c.currency} style={{ color: 'var(--color-muted)' }}>
                      {formatForeign(c.total, c.currency)}
                    </span>
                  ))}
                  <span>{formatBaht(Math.abs(section.total))}</span>
                </span>
              </summary>
              <ul className="panel flex flex-col divide-y overflow-hidden">
                {section.entries.map((entry) => (
                  <SwipeRow
                    key={entry.id}
                    entry={entry}
                    emoji={emojiFor(emojiMap, entry.category)}
                    iconSet={iconSet}
                    hue={hueFor(hueMap, entry.category)}
                    showForeign={tripMode}
                    dateLabel={
                      byCategory
                        ? spanAll
                          ? formatDayHeadingWithYear(entry.date)
                          : formatDayHeading(entry.date)
                        : undefined
                    }
                  />
                ))}
              </ul>
            </details>
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
      ) : tripMode ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No records in this trip{filtered ? ' match this filter' : ''}.
          </p>
          <Link
            href="/trips"
            className="text-sm font-medium"
            style={{ color: 'var(--color-accent-text)' }}
          >
            Back to trips
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

// A disclosure caret: points right when collapsed, rotates down when an ancestor <details> is open.
function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 transition-transform duration-150 [[open]_&]:rotate-90"
      style={{ color: 'var(--color-faint)' }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

// Left-pointing chevron for the "← Trips" back link.
function BackArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function ViewLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="flex-1 rounded-[var(--radius-md)] py-2 text-center text-sm font-medium transition-colors duration-150"
      style={{
        background: active ? 'var(--color-accent-soft)' : 'transparent',
        color: active ? 'var(--color-accent-text)' : 'var(--color-muted)',
      }}
    >
      {label}
    </Link>
  );
}
