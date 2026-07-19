'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getDistinctCategories, getCategoryBreakdown } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { getBudgets } from './queries';
import { toBudgetRows, toBudgetTotal, type BudgetRow, type BudgetTotal } from './budget-status';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { getEmojiMap, getHueMap } from '@features/categories/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

export type BudgetsData = {
  cycleLabel: string;
  emojis: Record<string, string>;
  hues: Record<string, number>;
  iconSet: IconSet;
  rows: BudgetRow[];
  total: BudgetTotal;
  active: BudgetRow[];
  dormant: BudgetRow[];
};

// Budgets page's standing-limits view, read once via the browser OPFS db after mount — mirrors the
// server computation the page used to run in a Server Component, just moved client-side + async.
// Always the CURRENT cycle (the page has no ?cycle= param); refetches when the data-version bumps
// after a BudgetField write.
export function useBudgetsPage(): { ready: boolean; data: BudgetsData | null } {
  const [data, setData] = useState<BudgetsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const cutoff = await getCutoff(db);
      const cycle = cycleFromKey(currentCycleKey(todayIso(), cutoff), cutoff);

      // This cycle's spend per category (magnitudes — the ledger stores outflow as negative).
      const breakdown = await getCategoryBreakdown(db, cycle.start, cycle.end);
      const spentByCategory = new Map(breakdown.map((b) => [b.key, Math.abs(b.total)]));
      const totalSpent = breakdown.reduce((sum, b) => sum + Math.abs(b.total), 0);

      const limits = new Map<string, number>();
      let totalLimit: number | null = null;
      for (const b of await getBudgets(db)) {
        if (b.category === null) totalLimit = b.amount;
        else limits.set(b.category, b.amount);
      }

      const [emojis, hues, iconSet, distinctCategories] = await Promise.all([
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
        getDistinctCategories(db),
      ]);

      const rows = toBudgetRows(distinctCategories, limits, spentByCategory);
      const total = toBudgetTotal(totalLimit, totalSpent);
      // A tracker leads with what's live this cycle. "Active" = spent something OR has a limit; the
      // rest is tucked behind a disclosure (mirrors the page's own comment before this moved here).
      const active = rows.filter((r) => r.spent > 0 || r.limit !== null);
      const dormant = rows.filter((r) => r.spent === 0 && r.limit === null);

      setData({ cycleLabel: cycle.label, emojis, hues, iconSet, rows, total, active, dormant });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
