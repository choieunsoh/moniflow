'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getCycleSummary, getCategoryBreakdown, type Summary, type Breakdown } from './queries';
import { cycleFromKey, currentCycleKey, cycleProgress, type Cycle, type Progress } from './cycle';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getBudgets } from '@features/budgets/queries';
import { toBudgetTotal, type BudgetTotal } from '@features/budgets/budget-status';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { toDonutSlices, type DonutSlice } from './donut';
import { todayIso } from '@shared/date';

export type HomeData = {
  cutoff: number;
  activeKey: string;
  currentKey: string;
  canGoNext: boolean;
  isCurrentCycle: boolean;
  cycle: Cycle;
  summary: Summary;
  categoryBreakdown: Breakdown[];
  slices: DonutSlice[];
  total: number;
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  limits: Map<string, number>;
  totalStatus: BudgetTotal | null;
  progress: Progress;
  pacePct: number | undefined;
};

// Home page's cycle data, read once via the browser OPFS db after mount — mirrors the server
// computation the page used to run in a Server Component, just moved client-side + async. Re-runs
// whenever the ?cycle= param (the caller's cycleKey) changes.
export function useHome(cycleKey: string | null): { ready: boolean; data: HomeData | null } {
  const [data, setData] = useState<HomeData | null>(null);
  const [ready, setReady] = useState(false);

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
      // No future cycles to spend in yet — cap forward navigation at today's cycle.
      const canGoNext = activeKey < currentKey;
      const isCurrentCycle = activeKey === currentKey;
      const cycle = cycleFromKey(activeKey, cutoff);
      const [summary, categoryBreakdown] = await Promise.all([
        getCycleSummary(db, cycle.start, cycle.end),
        getCategoryBreakdown(db, cycle.start, cycle.end),
      ]);

      const slices = toDonutSlices(categoryBreakdown);
      const total = slices.reduce((sum, s) => sum + s.value, 0);

      // Standing budgets: the category=null row is the whole-cycle total; the rest are per-category
      // caps keyed by name. Spend magnitudes come straight from the category breakdown (totals are
      // negative — take the abs).
      const budgetRows = await getBudgets(db);
      const totalLimit = budgetRows.find((b) => b.category === null)?.amount ?? null;
      const limits = new Map<string, number>();
      for (const b of budgetRows) {
        if (b.category !== null) limits.set(b.category, b.amount);
      }
      const totalStatus = totalLimit === null ? null : toBudgetTotal(totalLimit, total);

      // Time elapsed in the cycle drives both the standalone header bar and the "today" pace tick on
      // the budget meters — but a pace mark only makes sense while the cycle is live, so pacePct is
      // undefined on a past cycle (no tick), matching the header bar hiding there.
      const progress = cycleProgress(cycle, todayIso());
      const pacePct = isCurrentCycle ? (progress.day / progress.total) * 100 : undefined;

      setData({
        cutoff,
        activeKey,
        currentKey,
        canGoNext,
        isCurrentCycle,
        cycle,
        summary,
        categoryBreakdown,
        slices,
        total,
        emojiMap,
        hueMap,
        iconSet,
        limits,
        totalStatus,
        progress,
        pacePct,
      });
      setReady(true);
    })();
  }, [cycleKey]);

  return { ready, data };
}
