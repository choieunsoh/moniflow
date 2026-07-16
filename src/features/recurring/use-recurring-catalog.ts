'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { useDataVersion } from '@shared/data-version';
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { getIconSet, type IconSet } from '@features/settings/queries';
import { listRuleMeta, type RuleMeta } from './queries';

export type RecurringCatalog = {
  metaById: Record<number, RuleMeta>;
  categoryNames: string[];
  accountNames: string[];
  iconSet: IconSet;
};

// Feeds RecurringList's category marker + RuleForm's account/category selects. Kept as a SEPARATE
// hook from useRecurring (Task 11's TDD'd hook, mocked down to just `listRules` in its test) — this
// one does real cross-feature reads, so it's exercised only in the browser (verified in Task 12).
export function useRecurringCatalog(): { ready: boolean; catalog: RecurringCatalog | null } {
  const version = useDataVersion();
  const [ready, setReady] = useState(false);
  const [catalog, setCatalog] = useState<RecurringCatalog | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const [meta, categoryRows, accountRows, iconSet] = await Promise.all([
        listRuleMeta(db),
        getCategoryCatalog(db),
        getAccountCatalog(db),
        getIconSet(db),
      ]);
      if (!alive) return;

      const metaById: Record<number, RuleMeta> = {};
      for (const m of meta) metaById[m.id] = m;

      setCatalog({
        metaById,
        categoryNames: categoryRows.filter((c) => !c.archived).map((c) => c.name),
        accountNames: accountRows.map((a) => a.name),
        iconSet,
      });
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  return { ready, catalog };
}
