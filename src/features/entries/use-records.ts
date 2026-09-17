'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntriesInRange, searchEntries, getEntriesByCategory, getTripEntries } from './queries';
import type { EntryRow } from './schema';
import { groupByDate } from './by-date';
import { groupBySpend } from './by-spend';
import { cycleFromKey, currentCycleKey } from './cycle';
import { sumByCurrency, type CurrencySum } from './trips';
import { toHeatmapCells, type HeatmapCell } from './heatmap';
import { dayMarks, resolveSelectedDay, type DayMarks } from './calendar-marks';
import { discretionaryByDate } from './off-budget';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap, getOffBudgetCategories } from '@features/categories/queries';
import { getAccountIconMap, getAccountHueMap } from '@features/accounts/queries';
import { getTravelCurrencies } from '@features/currencies/queries';
import { listRules, listRuleMeta, type RuleMeta } from '@features/recurring/queries';
import type { Recurrence } from '@features/recurring/schema';
import { postsBetween } from '@features/recurring/schedule';
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
  day?: string;
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

// The Records group-by tab. One value rather than a set of booleans, which would admit illegal
// combinations; `?view=` carries it in the URL and anything unrecognised falls back to 'date'.
// 'calendar' exists only in the plain cycle view (not search/trip/all-category, not sort=amount).
export type RecordsGroupBy = 'date' | 'category' | 'account' | 'calendar';

// A recurring bill that has not posted yet, shown under its due day. `amount` is a positive magnitude:
// baht for a THB or pinned-rate rule (currency 'THB'), or the rule's own currency for a blank-rate
// foreign rule, which a pure preview cannot convert (committedThisCycle's byCurrency rule).
export type UpcomingBill = {
  id: number;
  name: string;
  category: string | null;
  amount: number;
  currency: string;
};

export type RecordsCalendar = {
  cells: HeatmapCell[];
  marks: Map<string, DayMarks>;
  selectedDay: string;
  // The selected day's entries, newest first, and their plain sum (the rows' own frame).
  dayEntries: EntryRow[];
  dayTotal: number;
  dayBills: UpcomingBill[];
};

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
  // Built only for the calendar view; null for every other view, so their reads cost nothing extra.
  calendar: RecordsCalendar | null;
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
    day,
  } = params;
  const [data, setData] = useState<RecordsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    // Deliberately no setReady(false) here — see use-categories-page / use-accounts-page. `?day=`
    // moving on a calendar tap is a param change like any other, and dropping back to `ready: false`
    // swapped the whole page for its `…` placeholder, shrinking the document and resetting scroll to
    // the top. `alive` (same shape as use-edit-rule) guards the case that removing it exposes: tap day
    // 25 then day 28 fast enough, and the 25 run must not win the race and overwrite 28's result.
    let alive = true;
    void withDb(async (db) => {
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
        view === 'category'
          ? 'category'
          : view === 'account'
            ? 'account'
            : view === 'calendar' && !spanAll && !sortByAmount
              ? 'calendar'
              : 'date';
      // Each section carries its own foreign-currency subtotals so any header — a day, a category, or
      // an account — can read "¥12,000  ฿2,800" when it holds foreign spending; empty otherwise.
      // Date ranks chronologically; category and account both rank by spend, so they share groupBySpend.
      // The calendar renders its own day list, but keeps day sections so `sections.length` still means
      // "this cycle has rows".
      const grouped = sortByAmount
        ? [
            {
              key: 'amount',
              entries: [...cycleEntries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
              total: cycleEntries.reduce((sum, e) => sum + e.amount, 0),
            },
          ]
        : groupBy === 'date' || groupBy === 'calendar'
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

      let calendar: RecordsCalendar | null = null;
      if (groupBy === 'calendar') {
        const today = todayIso();
        const [offBudgetCategories, travelCurrencies] = await Promise.all([
          getOffBudgetCategories(db),
          getTravelCurrencies(db),
        ]);
        // Only the current cycle has days after today; a past cycle's bills have all posted, so its
        // rules aren't read at all.
        const isCurrent = activeKey === currentKey;
        const rules: Recurrence[] = isCurrent ? await listRules(db) : [];
        const ruleMeta: RuleMeta[] = isCurrent ? await listRuleMeta(db) : [];
        const metaById = new Map(ruleMeta.map((m) => [m.id, m] as const));
        const bills = rules.flatMap((rule) => {
          const meta = metaById.get(rule.id);
          const categoryName = meta?.categoryName ?? null;
          // The same chips as the ledger rows, matched on the rule's resolved names.
          if (category && categoryName !== category) return [];
          if (account && (meta?.accountName ?? null) !== account) return [];
          const inBaht = rule.currency === null || rule.currency === 'THB' || rule.rate !== null;
          const bill: UpcomingBill = {
            id: rule.id,
            name: rule.name,
            category: categoryName,
            amount: inBaht ? rule.amount * (rule.rate ?? 1) : rule.amount,
            currency: inBaht ? 'THB' : (rule.currency ?? 'THB'),
          };
          return postsBetween(rule, today, cycle.end).map((due) => ({ date: due.date, bill }));
        });
        const selectedDay = resolveSelectedDay(day, cycle, today);
        const dayEntries = ordered.filter((e) => e.date === selectedDay);
        calendar = {
          cells: toHeatmapCells(
            discretionaryByDate(cycleEntries, offBudgetCategories, travelCurrencies),
            cycle,
          ),
          marks: dayMarks(
            cycleEntries,
            bills.map((b) => b.date),
            offBudgetCategories,
            travelCurrencies,
          ),
          selectedDay,
          dayEntries,
          dayTotal: dayEntries.reduce((sum, e) => sum + e.amount, 0),
          dayBills: bills.filter((b) => b.date === selectedDay).map((b) => b.bill),
        };
      }

      if (!alive) return; // a newer run already landed — don't clobber it with a stale one
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
        calendar,
      });
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [
    cycleParam,
    category,
    account,
    q,
    view,
    all,
    currency,
    from,
    to,
    sort,
    pageParam,
    day,
    version,
  ]);

  return { ready, data };
}

// A hand-typed or stale ?page= must never strand the list on an empty slice — deleting the last rows
// of a category is exactly how you end up on a page that no longer exists.
function clampPage(raw: string | undefined, pageCount: number): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, pageCount);
}
