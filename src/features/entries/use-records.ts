'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getEntriesInRange, searchEntries, getEntriesByCategory, getTripEntries } from './queries';
import type { EntryRow } from './schema';
import { groupByDate } from './by-date';
import { groupByCategory } from './by-category';
import { cycleFromKey, currentCycleKey } from './cycle';
import { sumByCurrency, type CurrencySum } from './trips';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
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
};

export type RecordsSection = {
  key: string;
  entries: EntryRow[];
  total: number;
  foreign: CurrencySum[];
};

export type RecordsData = {
  cutoff: number;
  activeKey: string;
  canGoNext: boolean;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  query: string;
  searching: boolean;
  tripMode: boolean;
  filtered: boolean;
  allCategory: boolean;
  spanAll: boolean;
  byCategory: boolean;
  entries: EntryRow[];
  sections: RecordsSection[];
  total: number;
  currencySums: CurrencySum[];
};

// Records page's ledger view, read once via the browser OPFS db after mount — mirrors the server
// computation the page used to run in a Server Component, just moved client-side + async. Re-runs
// whenever any of the page's search params (or the data-version counter) changes.
export function useRecords(params: RecordsParams): { ready: boolean; data: RecordsData | null } {
  const { cycle: cycleParam, category, account, q, view, all, currency, from, to } = params;
  const [data, setData] = useState<RecordsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const [cutoff, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
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
      const entries = searching
        ? await searchEntries(db, query)
        : tripMode
          ? tripEntries
          : allCategory && category
            ? await getEntriesByCategory(db, category)
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
      const currencySums = sumByCurrency(entries);

      setData({
        cutoff,
        activeKey,
        canGoNext,
        emojiMap,
        hueMap,
        iconSet,
        query,
        searching,
        tripMode,
        filtered,
        allCategory,
        spanAll,
        byCategory,
        entries,
        sections,
        total,
        currencySums,
      });
      setReady(true);
    })();
  }, [cycleParam, category, account, q, view, all, currency, from, to, version]);

  return { ready, data };
}
