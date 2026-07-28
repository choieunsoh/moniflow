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

// The /currency page's data. entryCount rides along so the page can warn before archiving a currency
// that still has history — archiving is reversible, but doing it blind to 478 JPY rows is not obvious.
export function useCurrencies(): { ready: boolean; data: CurrencyPageData | null } {
  const [data, setData] = useState<CurrencyPageData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
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
