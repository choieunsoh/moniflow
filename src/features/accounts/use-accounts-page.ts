'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import {
  getAccountCounts,
  getAccountBreakdown,
  type AccountCount,
  type Breakdown,
} from '@features/entries/queries';
import { getKeypadAccounts } from '@features/entries/keypad-lists';
import type { KeypadAccount } from '@features/entries/ui/Keypad';
import { toBars, type Bar } from '@features/entries/breakdown';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { getAccountIconMap, getAccountHueMap } from './queries';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

export type AccountsPageData = {
  counts: AccountCount[];
  iconMap: Record<string, string>;
  hueMap: Record<string, number>;
  breakdown: Breakdown[];
  bars: Bar[];
  keypadAccounts: KeypadAccount[];
};

// Accounts page's list + current-cycle breakdown, read once via the browser OPFS db after mount —
// mirrors the server computation the page used to run in a Server Component, just moved
// client-side + async. No URL inputs of its own (always the current cycle, like the server version
// did); re-runs whenever the data-version counter bumps (add/rename/delete/merge/reorder).
export function useAccountsPage(): { ready: boolean; data: AccountsPageData | null } {
  const [data, setData] = useState<AccountsPageData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void (async () => {
      // No setReady(false) on refetch — see use-categories-page: it unmounted the page (and with it
      // the open reorder sheet) on every version bump. `ready` means "loaded once", not "not stale".
      const db = await getBrowserDb();
      const [counts, iconMap, hueMap, cutoff, keypadAccounts] = await Promise.all([
        getAccountCounts(db),
        getAccountIconMap(db),
        getAccountHueMap(db),
        getCutoff(db),
        getKeypadAccounts(db),
      ]);

      const cycle = cycleFromKey(currentCycleKey(todayIso(), cutoff), cutoff);
      const breakdown = await getAccountBreakdown(db, cycle.start, cycle.end);
      const bars = toBars(breakdown);

      setData({ counts, iconMap, hueMap, breakdown, bars, keypadAccounts });
      setReady(true);
    })();
  }, [version]);

  return { ready, data };
}
