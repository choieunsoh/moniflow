'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getCategoryBreakdown, type Breakdown } from './queries';
import { lastCycles, currentCycleKey, type Cycle } from './cycle';
import { TREND_CYCLES, monthLabel, toTrendBars, type TrendBar } from './trend';
import { toDonutSlices, type DonutSlice } from './donut';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getBudgets } from '@features/budgets/queries';
import { toBudgetFitRows, type BudgetFitRow } from '@features/budgets/budget-status';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

export type AnalyticsData = {
  activeKey: string;
  currentKey: string;
  cycles: Cycle[];
  bars: TrendBar[];
  category: string | null;
  slices: DonutSlice[];
  total: number;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  fitRows: BudgetFitRow[];
};

// Sum a window's breakdowns into one ranked Breakdown[] — the category list under the chart shows
// the WINDOW's composition, not one cycle's. Totals stay negative (the ledger's sign) so the result
// is a plain Breakdown[] that toDonutSlices can take unchanged.
function aggregate(breakdowns: Breakdown[][]): Breakdown[] {
  const byKey = new Map<string, Breakdown>();
  for (const rows of breakdowns) {
    for (const row of rows) {
      const seen = byKey.get(row.key);
      if (seen === undefined) byKey.set(row.key, { ...row });
      else
        byKey.set(row.key, {
          key: row.key,
          total: seen.total + row.total,
          count: seen.count + row.count,
        });
    }
  }
  return [...byKey.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

// The analytics window's data, read after mount from the browser OPFS db. Re-runs when the ?cycle=
// or ?category= param changes, or after any write (useDataVersion).
//
// ponytail: TREND_CYCLES separate getCategoryBreakdown calls rather than one windowed query. The
// cycle boundary is a cutoff-day concept computed in cycle.ts, not something SQL knows — expressing
// it in one statement needs a CASE ladder or raw-row bucketing, and the latter defeats the GROUP BY
// that getCategoryBreakdown exists for. Six bounded aggregates against local OPFS is cheap. Collapse
// into a windowed query if a slow device ever makes it felt.
export function useAnalytics(
  cycleKey: string | null,
  category: string | null,
): { ready: boolean; data: AnalyticsData | null } {
  const [data, setData] = useState<AnalyticsData | null>(null);
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

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeKey = cycleKey ?? currentKey;
      const cycles = lastCycles(activeKey, TREND_CYCLES, cutoff);

      const breakdowns = await Promise.all(
        cycles.map((c) => getCategoryBreakdown(db, c.start, c.end)),
      );

      // The one primitive: cycle key → category → spend magnitude. Every view below is a projection
      // of this. Totals arrive negative (outflows); the matrix stores magnitudes.
      const matrix = new Map<string, Map<string, number>>();
      for (const [i, rows] of breakdowns.entries()) {
        const byCategory = new Map<string, number>();
        for (const row of rows) byCategory.set(row.key, Math.abs(row.total));
        matrix.set(cycles[i].key, byCategory);
      }

      // Total trend = sum each cycle's row. Category trend = read one column. Same chart.
      const spendByCycle = new Map<string, number>();
      for (const [key, byCategory] of matrix) {
        const value =
          category === null
            ? [...byCategory.values()].reduce((sum, v) => sum + v, 0)
            : (byCategory.get(category) ?? 0);
        spendByCycle.set(key, value);
      }

      const bars = toTrendBars(cycles, spendByCycle, currentKey);
      const slices = toDonutSlices(aggregate(breakdowns));
      const total = [...spendByCycle.values()].reduce((sum, v) => sum + v, 0);

      const limits = new Map<string, number>();
      for (const b of await getBudgets(db)) {
        if (b.category !== null) limits.set(b.category, b.amount);
      }
      const fitRows = toBudgetFitRows(
        limits,
        matrix,
        cycles.map((c) => ({ key: c.key, label: monthLabel(c.key) })),
      );

      setData({
        activeKey,
        currentKey,
        cycles,
        bars,
        category,
        slices,
        total,
        emojiMap,
        hueMap,
        iconSet,
        fitRows,
      });
      setReady(true);
    })();
  }, [cycleKey, category, version]);

  return { ready, data };
}
