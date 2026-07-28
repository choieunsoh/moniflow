'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { useDataVersion } from '@shared/data-version';
import { currencySymbol } from '@shared/money';
import { getCurrencyCounts } from '@features/entries/queries';
import { getFxRates } from '@features/settings/queries';
import { listAllCurrencies } from './queries';
import { addableCurrencies } from './addable';

export type CurrencyPageRow = {
  code: string;
  offBudget: boolean;
  archived: boolean;
  symbol: string;
  thbPerUnit: number | null;
  asOf: string | null;
  entryCount: number;
};
export type CurrencyPageData = { rows: CurrencyPageRow[]; addable: string[] };

// The /currency page's data. entryCount rides along so the page can surface how much history a
// currency carries in its caption before the user hides it — not a confirm dialog, just visibility.
export function useCurrencies(): { ready: boolean; data: CurrencyPageData | null } {
  const [data, setData] = useState<CurrencyPageData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    // NOT setReady(false) here — see use-home.ts's identical comment for the full reasoning. This
    // page's every write (off-budget toggle, hide/restore, add) bumps the data version and refetches;
    // dropping ready on that swaps the whole list for the "…" skeleton and bounces scroll on every
    // tap. `ready` still starts false, so first mount shows the placeholder as before.
    void withDb(async (db) => {
      const [catalog, rates, counts] = await Promise.all([
        listAllCurrencies(db),
        getFxRates(db),
        getCurrencyCounts(db),
      ]);
      const countByCode = new Map(counts.map((c) => [c.currency, c.count]));
      const rows = catalog.map((r) => {
        const rate = rates[r.code];
        return {
          code: r.code,
          offBudget: r.offBudget === 1,
          archived: r.archived === 1,
          symbol: currencySymbol(r.code),
          thbPerUnit: rate === undefined ? null : rate.thbPerUnit,
          asOf: rate === undefined ? null : rate.asOf,
          entryCount: countByCode.get(r.code) ?? 0,
        };
      });
      setData({ rows, addable: addableCurrencies(new Set(catalog.map((r) => r.code))) });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
