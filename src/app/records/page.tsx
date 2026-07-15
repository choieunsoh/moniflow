'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PageContainer } from '@shared/ui/PageContainer';
import { useRecords, type RecordsGroupBy } from '@features/entries/use-records';
import { formatDateRange, formatForeign } from '@features/entries/trips';
import { emojiFor, hueFor } from '@features/categories/queries';
import { iconForAccount, hueForAccount } from '@features/accounts/queries';
import { formatDayHeading, formatDayHeadingWithYear } from '@shared/date';
import { formatBaht } from '@shared/money';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { CollapseAllButton } from '@features/entries/ui/CollapseAllButton';
import { SwipeRow } from '@features/entries/ui/SwipeRow';
import { CategoryIconButton } from '@features/categories/ui/CategoryPicker';
import { AccountIcon } from '@features/accounts/ui/AccountIcon';
import { HeaderFilterChip } from '@features/entries/ui/HeaderFilterChip';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';

// Records = the cycle's expenses grouped by day, newest first. Each day is a light header (date +
// day total) over a panel of rows; each row swipes to reveal Edit / Delete. Cycle/filter/search data
// loads client-side via useRecords against the browser OPFS db (params come from useSearchParams,
// not a server searchParams prop).
export default function RecordsPage() {
  const params = useSearchParams();
  const cycleParam = params.get('cycle') ?? undefined;
  const category = params.get('category') ?? undefined;
  const account = params.get('account') ?? undefined;
  const q = params.get('q') ?? undefined;
  const view = params.get('view') ?? undefined;
  const all = params.get('all') ?? undefined;
  const currency = params.get('currency') ?? undefined;
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;

  const { ready, data } = useRecords({
    cycle: cycleParam,
    category,
    account,
    q,
    view,
    all,
    currency,
    from,
    to,
  });

  if (!ready || data === null) {
    return (
      <PageContainer size="full">
        <div
          className="grid h-32 place-items-center text-sm"
          style={{ color: 'var(--color-muted)' }}
        >
          …
        </div>
      </PageContainer>
    );
  }

  const {
    cutoff,
    activeKey,
    canGoNext,
    emojiMap,
    hueMap,
    accountIconMap,
    accountHueMap,
    iconSet,
    query,
    searching,
    tripMode,
    filtered,
    allCategory,
    spanAll,
    groupBy,
    entries,
    sections,
    total,
    currencySums,
  } = data;

  // Tap a section header to filter to just that bucket (staying grouped); tap the active one to
  // clear. Mirrors the row chips — preserves the cycle, the grouping, and the other axis's filter,
  // so a category filter survives a tap on an account header and vice versa. Only the plain cycle
  // view offers it (spanAll modes ignore both params, so the callers gate it out below).
  const headerFilterHref = (key: string) => {
    const byAccount = groupBy === 'account';
    const active = byAccount ? account : category;
    const other = byAccount ? category : account;
    const p = new URLSearchParams();
    p.set('cycle', activeKey);
    p.set('view', groupBy);
    if (active !== key) p.set(byAccount ? 'account' : 'category', key);
    if (other) p.set(byAccount ? 'category' : 'account', other);
    return `/records?${p.toString()}`;
  };

  // Tab links preserve the current cycle/search/filter and only flip ?view=. 'date' is the default,
  // so it drops the param entirely rather than spelling out the fallback.
  const viewHref = (next: RecordsGroupBy) => {
    const p = new URLSearchParams();
    if (searching) p.set('q', query);
    else if (tripMode && currency && from && to) {
      p.set('currency', currency);
      p.set('from', from);
      p.set('to', to);
    } else if (allCategory) p.set('all', '1');
    else p.set('cycle', activeKey);
    if (category) p.set('category', category);
    if (account) p.set('account', account);
    if (next !== 'date') p.set('view', next);
    return `/records?${p.toString()}`;
  };

  return (
    <PageContainer size="full">
      {!spanAll && (
        <CycleSelector
          activeKey={activeKey}
          cutoff={cutoff}
          canGoNext={canGoNext}
          view={groupBy !== 'date' ? groupBy : undefined}
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
          {/* Group-by tabs — flip the same entries between day, category and account sections. Text,
              not icons: a tag vs a wallet isn't self-evident the way the BottomBar's home/search
              glyphs are, and this is a control you read once rather than hit blind. */}
          <div className="panel flex gap-1 p-1">
            <ViewLink label="By date" active={groupBy === 'date'} href={viewHref('date')} />
            <ViewLink
              label="By category"
              active={groupBy === 'category'}
              href={viewHref('category')}
            />
            <ViewLink
              label="By account"
              active={groupBy === 'account'}
              href={viewHref('account')}
            />
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
            // Native <details> = tap the header to collapse/expand, no JS. Expanded by default;
            // the open/closed state is DOM-local and resets when a param re-renders the page.
            <details open key={section.key} data-records-section className="flex flex-col gap-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-1 [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Chevron />
                  {groupBy === 'date' ? (
                    <h2 className="truncate text-sm font-semibold">
                      {spanAll
                        ? formatDayHeadingWithYear(section.key)
                        : formatDayHeading(section.key)}
                    </h2>
                  ) : (
                    <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                      {/* Category markers double as the icon/colour editor; account markers don't —
                          accounts are edited on their own page, so this stays a plain marker. */}
                      {groupBy === 'category' ? (
                        <CategoryIconButton
                          category={section.key}
                          emoji={emojiFor(emojiMap, section.key)}
                          iconSet={iconSet}
                          hue={hueFor(hueMap, section.key)}
                          size="sm"
                        />
                      ) : (
                        <AccountIcon
                          icon={iconForAccount(accountIconMap, section.key)}
                          name={section.key}
                          hue={hueForAccount(accountHueMap, section.key)}
                          size="sm"
                        />
                      )}
                      {/* Cycle view: the header filters to its own bucket. spanAll modes (search,
                          trip, all-category) ignore these params, so they keep a plain label. */}
                      {spanAll ? (
                        <span className="truncate">{section.key}</span>
                      ) : (
                        <HeaderFilterChip
                          href={headerFilterHref(section.key)}
                          active={(groupBy === 'account' ? account : category) === section.key}
                          label={section.key}
                        />
                      )}
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
                    foreignLeads={tripMode}
                    // Each row states what its header doesn't: the date under a category/account
                    // header, and the axis the header already names is dropped.
                    dateLabel={
                      groupBy !== 'date'
                        ? spanAll
                          ? formatDayHeadingWithYear(entry.date)
                          : formatDayHeading(entry.date)
                        : undefined
                    }
                    hideCategory={groupBy === 'category'}
                    hideAccount={groupBy === 'account'}
                  />
                ))}
              </ul>
            </details>
          ))}
          <p className="px-1 text-center text-xs" style={{ color: 'var(--color-faint)' }}>
            Tap a row to edit · swipe left to delete
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
