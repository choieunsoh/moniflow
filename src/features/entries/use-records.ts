'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntriesInRange, searchEntries, getEntriesByCategory, getTripEntries } from './queries';
import type { EntryRow } from './schema';
import { groupByDate } from './by-date';
import { groupBySpend } from './by-spend';
import { cycleFromKey, currentCycleKey } from './cycle';
import { sumByCurrency, type CurrencySum } from './trips';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { getAccountIconMap, getAccountHueMap } from '@features/accounts/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

export type RecordsParams = {
  cycle?: string;
  category?: string;
  account?: string;
  q?: string;
  view?: string;
  all?: string;
  currency?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: string;
};

// The all-category view is the one records list with no window bounding it: /report links here for a
// whole category's history, and the busiest are thousands of rows — each a SwipeRow with its own
// touch handlers. Every other mode is already bounded (a cycle, a trip's date range, a search the
// user narrowed), so only this one paginates.
const PAGE_SIZE = 100;

export type RecordsSection = {
  key: string;
  entries: EntryRow[];
  total: number;
  foreign: CurrencySum[];
};

// The Records group-by tab. One three-way value rather than a pair of booleans, which would admit an
// illegal "both" state; `?view=` carries it in the URL and anything unrecognised falls back to 'date'.
export type RecordsGroupBy = 'date' | 'category' | 'account';

export type RecordsData = {
  cutoff: number;
  activeKey: string;
  canGoNext: boolean;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  accountIconMap: Record<string, string>;
  accountHueMap: Record<string, number>;
  iconSet: IconSet;
  query: string;
  searching: boolean;
  tripMode: boolean;
  filtered: boolean;
  allCategory: boolean;
  spanAll: boolean;
  groupBy: RecordsGroupBy;
  // The WHOLE matched set, never the page — the count line and `total` below describe the category,
  // which is what the /report row that linked here promised. `sections` alone holds the page.
  entries: EntryRow[];
  sections: RecordsSection[];
  total: number;
  currencySums: CurrencySum[];
  // 1-based and already clamped into range; pageCount is 1 in every unpaginated mode, so the page
  // can gate its pager on `pageCount > 1` without knowing which modes those are.
  page: number;
  pageCount: number;
};

// Records page's ledger view, read once via the browser OPFS db after mount — mirrors the server
// computation the page used to run in a Server Component, just moved client-side + async. Re-runs
// whenever any of the page's search params (or the data-version counter) changes.
export function useRecords(params: RecordsParams): { ready: boolean; data: RecordsData | null } {
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
    sort,
    page: pageParam,
  } = params;
  const [data, setData] = useState<RecordsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, emojiMap, hueMap, accountIconMap, accountHueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
        getAccountIconMap(db),
        getAccountHueMap(db),
        getIconSet(db),
      ]);

      const query = (q ?? '').trim();
      const searching = query.length > 0;

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeKey = cycleParam ?? currentKey;
      const canGoNext = activeKey < currentKey; // cap forward navigation at today's cycle
      const cycle = cycleFromKey(activeKey, cutoff);
      const inCycle = await getEntriesInRange(db, cycle.start, cycle.end);
      // Tap-a-chip filters by category and/or account. Applied to whichever set is on screen.
      const applyChips = (rows: EntryRow[]) =>
        rows.filter(
          (e) => (!category || e.category === category) && (!account || e.account === account),
        );
      const cycleEntries = applyChips(inCycle);
      const filtered = Boolean(category || account);

      // Trip mode: opened from a Trips card — one foreign currency within its date range, across cycles.
      const tripMode = Boolean(currency && from && to);
      const tripEntries =
        currency && from && to ? applyChips(await getTripEntries(db, currency, from, to)) : [];

      // Two modes span ALL cycles (rows already newest-first): text search, and the /categories count
      // link (?all=1&category=) which wants every record in a category, not just this cycle. Everything
      // else is the active cycle.
      const allCategory = !searching && !tripMode && all === '1' && Boolean(category);
      const spanAll = searching || allCategory || tripMode;
      // ?sort=amount ranks the active cycle's own entries — search/trip/all-category keep their
      // own ordering (newest first / spend-ranked), so this only applies to the plain cycle view.
      const sortByAmount = sort === 'amount' && !spanAll;
      const entries = searching
        ? await searchEntries(db, query)
        : tripMode
          ? tripEntries
          : allCategory && category
            ? await getEntriesByCategory(db, category)
            : cycleEntries;
      const ordered = spanAll ? entries : [...entries].reverse(); // newest first
      // Sliced BEFORE grouping, so a day header's count and subtotal describe the rows actually
      // under it. Grouping first and slicing sections would leave a header claiming 40 entries over
      // a list of 3.
      const pageCount = allCategory ? Math.max(1, Math.ceil(ordered.length / PAGE_SIZE)) : 1;
      const page = clampPage(pageParam, pageCount);
      const visible = allCategory
        ? ordered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        : ordered;
      const groupBy: RecordsGroupBy =
        view === 'category' ? 'category' : view === 'account' ? 'account' : 'date';
      // Each section carries its own foreign-currency subtotals so any header — a day, a category, or
      // an account — can read "¥12,000  ฿2,800" when it holds foreign spending; empty otherwise.
      // Date ranks chronologically; category and account both rank by spend, so they share groupBySpend.
      const grouped = sortByAmount
        ? [
            {
              key: 'amount',
              entries: [...cycleEntries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
              total: cycleEntries.reduce((sum, e) => sum + e.amount, 0),
            },
          ]
        : groupBy === 'date'
          ? groupByDate(visible).map((g) => ({ key: g.date, entries: g.entries, total: g.total }))
          : groupBySpend(visible, groupBy === 'category' ? (e) => e.category : (e) => e.account);
      const sections = grouped.map((g) => ({
        key: g.key,
        entries: g.entries,
        total: g.total,
        foreign: sumByCurrency(g.entries),
      }));
      const total = entries.reduce((sum, e) => sum + e.amount, 0);
      const currencySums = sumByCurrency(entries);

      setData({
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
        page,
        pageCount,
      });
      setReady(true);
    });
  }, [cycleParam, category, account, q, view, all, currency, from, to, sort, pageParam, version]);

  return { ready, data };
}

// A hand-typed or stale ?page= must never strand the list on an empty slice — deleting the last rows
// of a category is exactly how you end up on a page that no longer exists.
function clampPage(raw: string | undefined, pageCount: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, pageCount);
}
