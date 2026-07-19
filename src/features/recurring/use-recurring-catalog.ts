'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { useDataVersion } from '@shared/data-version';
import { getIconSet, type IconSet } from '@features/settings/queries';
import { listRuleMeta, type RuleMeta } from './queries';

export type RecurringCatalog = {
  metaById: Record<number, RuleMeta>;
  iconSet: IconSet;
};

// Feeds each rule row's category marker — the rules table stores ids, and a marker needs the name,
// emoji, and hue behind them. Kept as a SEPARATE hook from useRecurring (whose test mocks ./queries
// down to just `listRules`); this one does real cross-feature reads.
//
// It deliberately does NOT load category/account name lists: the rule keypad takes its pickers from
// useNewEntry, the very lists the expense keypad uses, so fetching them here would be two dead
// queries on every page load.
export function useRecurringCatalog(): { ready: boolean; catalog: RecurringCatalog | null } {
  const version = useDataVersion();
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<RecurringCatalog | null>(null);

  useEffect(() => {
    let alive = true;
    void withDb(async (db) => {
      setReady(false);
      const [meta, iconSet] = await Promise.all([listRuleMeta(db), getIconSet(db)]);
      if (!alive) return;

      const metaById: Record<number, RuleMeta> = {};
      for (const m of meta) metaById[m.id] = m;

      setCatalog({ metaById, iconSet });
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [version]);

  return { ready, catalog };
}
