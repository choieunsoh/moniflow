'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getCycleSummary, getEntriesInRange } from './queries';
import type { EntryRow } from './schema';
import { currentCycleKey, cycleFromKey, stepKey, cycleProgress, type Cycle } from './cycle';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { getBudgets } from '@features/budgets/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';
import {
  safeToSpendPerDay,
  averagePerDay,
  projectCycleTotal,
  cycleDelta,
  type CycleDelta,
} from './dashboard';

const RECENT_LIMIT = 5;

export type DashboardData = {
  cutoff: number;
  currentKey: string;
  cycle: Cycle;
  total: number; // magnitude spent this cycle
  count: number;
  totalBudget: number | null;
  daysElapsed: number;
  daysLeft: number;
  cycleLength: number;
  safePerDay: number | null;
  avgPerDay: number;
  projected: number | null;
  delta: CycleDelta | null;
  recent: EntryRow[];
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
};

// The /dashboard screen's data — always the CURRENT cycle (no ?cycle= param): its safe-to-spend and
// projection figures need days remaining, which a past cycle doesn't have. Read once after mount,
// re-run on every data-version bump. Mirrors useHome's load pattern, but assembles the
// forward-looking figures instead of the donut.
export function useDashboard(): { ready: boolean; data: DashboardData | null } {
  const [data, setData] = useState<DashboardData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [cutoff, emojiMap, hueMap, iconSet] = await Promise.all([
        getCutoff(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
      ]);

      const currentKey = currentCycleKey(todayIso(), cutoff);
      const cycle = cycleFromKey(currentKey, cutoff);
      const prev = cycleFromKey(stepKey(currentKey, -1), cutoff);

      const [summary, prevSummary, entriesInCycle, budgetRows] = await Promise.all([
        getCycleSummary(db, cycle.start, cycle.end),
        getCycleSummary(db, prev.start, prev.end),
        getEntriesInRange(db, cycle.start, cycle.end),
        getBudgets(db),
      ]);

      const total = Math.abs(summary.outflow);
      const count = summary.count;
      // No entries in the prior cycle → no comparable history yet (null), rather than a misleading
      // "vs ฿0". A cycle you tracked nothing in isn't a baseline.
      const prevTotal = prevSummary.count > 0 ? Math.abs(prevSummary.outflow) : null;
      const totalBudget = budgetRows.find((b) => b.category === null)?.amount ?? null;

      const progress = cycleProgress(cycle, todayIso());
      const daysElapsed = progress.day;
      const cycleLength = progress.total;
      const daysLeft = cycleLength - daysElapsed + 1; // today inclusive

      // Newest first; id (autoincrement) breaks ties within a day. Slice in JS — a cycle is ~a month
      // of rows, far too few to warrant a dedicated LIMIT query.
      const recent = [...entriesInCycle]
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
        .slice(0, RECENT_LIMIT);

      setData({
        cutoff,
        currentKey,
        cycle,
        total,
        count,
        totalBudget,
        daysElapsed,
        daysLeft,
        cycleLength,
        safePerDay: safeToSpendPerDay(totalBudget, total, daysLeft),
        avgPerDay: averagePerDay(total, daysElapsed),
        projected: projectCycleTotal(total, daysElapsed, cycleLength),
        delta: cycleDelta(total, prevTotal),
        recent,
        emojiMap,
        hueMap,
        iconSet,
      });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
