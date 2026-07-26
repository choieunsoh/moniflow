'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getFirstExpenseDate } from './queries';
import { buildBreakdownMatrix } from './breakdown-matrix';
import { cyclesForMonth, currentCycleKey, firstTrackedYear, type Cycle } from './cycle';
import { toTrendBars, yearLabel, monthName, type TrendBar } from './trend';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

// One year's occurrence of the month, for the filtered list — the same shape the analytics cycle
// list uses, but its label is a year.
export type MonthYearRow = { key: string; label: string; value: number; count: number };
export type MonthCategory = { name: string; value: number; count: number };

// The delta between the two most recent occurrences of this month. Null while the newest one is
// still running: `partial` exists to stop an unfinished cycle being compared as if it were
// finished, and a delta IS a comparison — July at day 8 against a whole July always reads as a
// collapse. Same reasoning completeBars applies to the average.
export type MonthDelta = { amount: number; pct: number | null; againstLabel: string };

export type MonthData = {
  month: number;
  monthName: string;
  bars: TrendBar[];
  // The most recent occurrence — the figure the page leads with. Null when this month has never
  // happened inside the ledger's span.
  latest: TrendBar | null;
  delta: MonthDelta | null;
  // The latest occurrence's composition, ranked. Unfiltered only — filtered, cycleRows decomposes
  // the same headline down the years instead, so the two lists never both answer at once.
  categories: MonthCategory[];
  cycleRows: MonthYearRow[];
  firstYear: number | null;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// /month's data: one calendar month seen across every year the ledger covers, optionally scoped to
// a category. Re-runs on ?month=/?category= change or after any write.
//
// The per-window aggregate strategy and its ceiling are documented on buildBreakdownMatrix.
export function useMonth(
  month: number | null,
  category: string | null,
): { ready: boolean; data: MonthData | null } {
  const [data, setData] = useState<MonthData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, firstDate, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getFirstExpenseDate(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
      ]);

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeMonth = month ?? Number(currentKey.split('-')[1]);
      const firstYear = firstTrackedYear(firstDate, cutoff);
      const cycles =
        firstYear === null ? [] : cyclesForMonth(activeMonth, currentKey, firstYear, cutoff);

      // cycle key → category → {value, count}. The one primitive, exactly as use-analytics builds
      // it: unfiltered every view sums a row, filtered it reads one column.
      const matrix = await buildBreakdownMatrix(db, cycles);

      const spendByCycle = new Map<string, number>();
      for (const [key, byCategory] of matrix)
        spendByCycle.set(
          key,
          category === null
            ? [...byCategory.values()].reduce((sum, v) => sum + v.value, 0)
            : (byCategory.get(category)?.value ?? 0),
        );

      const bars = toTrendBars(cycles, spendByCycle, currentKey, yearLabel);
      const latest = bars.length > 0 ? bars[bars.length - 1] : null;
      const previous = bars.length > 1 ? bars[bars.length - 2] : null;

      setData({
        month: activeMonth,
        monthName: monthName(activeMonth),
        bars,
        latest,
        delta: toDelta(latest, previous),
        categories: category === null ? rankCategories(matrix, latest) : [],
        cycleRows: category === null ? [] : toYearRows(matrix, cycles, category),
        firstYear,
        emojiMap,
        hueMap,
        iconSet,
      });
      setReady(true);
    });
  }, [month, category, version]);

  return { ready, data };
}

function toDelta(latest: TrendBar | null, previous: TrendBar | null): MonthDelta | null {
  if (latest === null || previous === null || latest.partial) return null;
  const amount = latest.value - previous.value;
  // No percentage against a zero baseline — "up ∞%" from a month you did not track is noise, and
  // the absolute figure already says everything true about it.
  return {
    amount,
    pct: previous.value > 0 ? amount / previous.value : null,
    againstLabel: previous.label,
  };
}

function rankCategories(
  matrix: Map<string, Map<string, { value: number; count: number }>>,
  latest: TrendBar | null,
): MonthCategory[] {
  const byCategory = latest === null ? undefined : matrix.get(latest.key);
  if (byCategory === undefined) return [];
  return [...byCategory.entries()]
    .map(([name, v]) => ({ name, value: v.value, count: v.count }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

// Filtered: one row per year, so the list decomposes the headline down the years and sums to the
// chart. Years with no spend in that category are kept — unlike the analytics cycle list, a missing
// year here IS the answer ("you did not buy this in 2019"), and dropping it would silently shorten
// a list the chart still draws in full.
function toYearRows(
  matrix: Map<string, Map<string, { value: number; count: number }>>,
  cycles: Cycle[],
  category: string,
): MonthYearRow[] {
  return cycles.map((c) => {
    const hit = matrix.get(c.key)?.get(category);
    return {
      key: c.key,
      label: yearLabel(c.key),
      value: hit?.value ?? 0,
      count: hit?.count ?? 0,
    };
  });
}
