'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import {
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
  type Breakdown,
} from './queries';
import { lastCycles, currentCycleKey } from './cycle';
import { TREND_CYCLES, toTrendBars, monthLabel, type TrendBar } from './trend';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { getAccountIconMap, getAccountHueMap } from '@features/accounts/queries';
import { getBudgets } from '@features/budgets/queries';
import { cycleDelta, type CycleDelta } from './dashboard';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import { groupByDate } from './by-date';
import { topNotes, type NoteRow } from './by-note';
import { toHeatmapCells, type HeatmapCell } from './heatmap';
import { anomalies, type Anomaly } from './anomaly';
import { deltaByCategory, type DeltaContributor } from './delta-breakdown';

// One cycle's spend for the filtered category. The filtered list's row shape — unfiltered the list
// decomposes by CATEGORY (CategoryRow), filtered it decomposes by CYCLE. Two shapes because they
// answer two questions.
export type CycleRow = { key: string; label: string; value: number; count: number };

// One category's window total. Unlike the home donut (capped at the palette size + an "Other"
// bucket so the RING stays readable), the analytics list has no ring to key to and shows every
// category — so this is the full ranked breakdown, no "Other". The marker takes its own hue.
export type CategoryRow = { name: string; value: number; count: number };

export type AnalyticsData = {
  activeKey: string;
  currentKey: string;
  bars: TrendBar[];
  categories: CategoryRow[];
  total: number;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  // Which grouping the (unfiltered) window list above is showing — category is the default.
  by: 'category' | 'account';
  accountIconMap: Record<string, string>;
  accountHueMap: Record<string, number>;
  cycleRows: CycleRow[];
  // The budget for whatever the chart is showing: the whole-cycle total when unfiltered, that
  // category's own limit when filtered, null when neither is set. The chart draws it as a passive
  // reference line (see buildTrendOption) — never an axis constraint.
  budgetLine: number | null;
  // Anchor cycle vs the one before it, unfiltered only (see the derivation comment below). null when
  // filtered, or when there is no comparable earlier cycle.
  delta: CycleDelta | null;
  // The top categories that drove `delta`, unfiltered only (empty when filtered). Powers the
  // CycleDeltaCard "what changed" rows.
  deltaBreakdown: DeltaContributor[];
  topNotes: NoteRow[];
  heatmapCells: HeatmapCell[];
  anomalies: Anomaly[];
};

// Sum a window's breakdowns into one ranked Breakdown[] — the category list under the chart shows
// the WINDOW's composition, not one cycle's. Totals stay negative (the ledger's sign); the caller
// takes the magnitude when it projects out CategoryRows.
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
  by: string | null = null,
): { ready: boolean; data: AnalyticsData | null } {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    const grouping: 'account' | 'category' = by === 'account' ? 'account' : 'category';
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, emojiMap, hueMap, iconSet, accountIconMap, accountHueMap] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
        getAccountIconMap(db),
        getAccountHueMap(db),
      ]);

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const activeKey = cycleKey ?? currentKey;
      const cycles = lastCycles(activeKey, TREND_CYCLES, cutoff);

      // The one primitive: cycle key → category → { spend magnitude, entry count }. Every view below
      // is a projection of this EXCEPT the window list — anomalies() (and the trend/budget/delta
      // totals, which agree either way since regrouping doesn't change a cycle's sum) stay
      // category-keyed regardless of `by`, so an account name can never reach Anomaly.category.
      const categoryBreakdowns = await Promise.all(
        cycles.map((c) => getCategoryBreakdown(db, c.start, c.end)),
      );
      const matrix = new Map<string, Map<string, { total: number; count: number }>>();
      for (const [i, rows] of categoryBreakdowns.entries()) {
        const byCategory = new Map<string, { total: number; count: number }>();
        for (const row of rows)
          byCategory.set(row.key, { total: Math.abs(row.total), count: row.count });
        matrix.set(cycles[i].key, byCategory);
      }

      // The window LIST's own grouping — a separate aggregation, used only for `categories` below, so
      // an account-grouped list never reaches anomalies(). Filtered, cycleRows keys off `category` and
      // stays on the category matrix regardless of `by`.
      const listBreakdowns =
        grouping === 'account' && category === null
          ? await Promise.all(cycles.map((c) => getAccountBreakdown(db, c.start, c.end)))
          : categoryBreakdowns;

      const active = cycles[cycles.length - 1];
      const cycleEntries = await getEntriesInRange(db, active.start, active.end);
      const notes = topNotes(cycleEntries);
      const heatmapCells = toHeatmapCells(groupByDate(cycleEntries), active);
      const flagged = anomalies(matrix, activeKey);

      // Total trend = sum each cycle's row. Category trend = read one column. Same chart.
      const spendByCycle = new Map<string, number>();
      for (const [key, byCategory] of matrix) {
        const value =
          category === null
            ? [...byCategory.values()].reduce((sum, v) => sum + v.total, 0)
            : (byCategory.get(category)?.total ?? 0);
        spendByCycle.set(key, value);
      }

      // Filtered, the list decomposes the header total per cycle — so it sums to the figure above
      // it. Unfiltered there is nothing to decompose this way (the category list does that job), so
      // it is empty. Cycles with no spend are skipped: a zero row is noise in a list, though it stays
      // a real zero in the BARS, where a gap would read as a rendering bug.
      const cycleRows: CycleRow[] =
        category === null
          ? []
          : cycles
              .map((c) => ({
                key: c.key,
                label: monthLabel(c.key),
                value: matrix.get(c.key)?.get(category)?.total ?? 0,
                count: matrix.get(c.key)?.get(category)?.count ?? 0,
              }))
              .filter((r) => r.value > 0);

      const bars = toTrendBars(cycles, spendByCycle, currentKey);
      // Every category in the window, biggest first — no palette cap, no "Other" (the analytics list
      // has no donut ring whose colours it must match). Magnitudes; drop the zero-spend tail.
      const categories: CategoryRow[] = aggregate(listBreakdowns)
        .map((r) => ({ name: r.key, value: Math.abs(r.total), count: r.count }))
        .filter((c) => c.value > 0);
      const total = [...spendByCycle.values()].reduce((sum, v) => sum + v, 0);

      // The category=null row is the whole-cycle TOTAL budget; the rest are per-category caps. The
      // line marks the budget for whatever the chart shows — total unfiltered, this category's limit
      // when filtered — or null when that has no budget set.
      const budgetRows = await getBudgets(db);
      const totalLimit = budgetRows.find((b) => b.category === null)?.amount ?? null;
      const limits = new Map<string, number>();
      for (const b of budgetRows) {
        if (b.category !== null) limits.set(b.category, b.amount);
      }
      const budgetLine = category === null ? totalLimit : (limits.get(category) ?? null);

      // The anchor cycle vs the one before it — the trend window's last two bars, so no extra query.
      // Filtered, `bars` is this category's per-cycle spend, so the last two bars give the category's
      // own current-vs-previous delta — the per-category "vs last cycle" the user asked for.
      // Unfiltered they are the whole-cycle totals. Either way a zero prev bar means no comparable
      // earlier cycle (null). deltaBreakdown stays unfiltered-only (Task 2's guard).
      const lastBar = bars[bars.length - 1];
      const prevBar = bars[bars.length - 2];
      const prevTotal = prevBar !== undefined && prevBar.value > 0 ? prevBar.value : null;
      const delta = lastBar !== undefined ? cycleDelta(lastBar.value, prevTotal) : null;

      // Unfiltered only: which categories moved the total. The window's last two cycle keys are the
      // active cycle and the one before it — the same pair `delta` compares.
      const prevCycleKey = cycles[cycles.length - 2]?.key;
      const deltaBreakdown =
        category === null && delta !== null && prevCycleKey !== undefined
          ? deltaByCategory(matrix, activeKey, prevCycleKey).slice(0, 4)
          : [];

      setData({
        activeKey,
        currentKey,
        bars,
        categories,
        total,
        emojiMap,
        hueMap,
        iconSet,
        by: grouping,
        accountIconMap,
        accountHueMap,
        cycleRows,
        budgetLine,
        delta,
        deltaBreakdown,
        topNotes: notes,
        heatmapCells,
        anomalies: flagged,
      });
      setReady(true);
    });
  }, [cycleKey, category, by, version]);

  return { ready, data };
}
