'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { useDataVersion } from '@shared/data-version';
import { getCardFeePct, getFxRates, type FxRates } from '@features/settings/queries';
import { listCurrencies } from './queries';

export type ConvertData = { codes: string[]; rates: FxRates; cardFeePct: number };

// The /convert page's data: the visible catalog (what the pickers offer), the cached ECB mid rates,
// and the user's real card fee (which row gets the ★). Refetches on the data version, so the page's
// Refresh — refreshFxRatesAction bumps it — updates the table in place. Not setReady(false) on
// refetch, for the same reason as use-currencies.ts: a refresh must not blank the page.
export function useConvert(): { ready: boolean; data: ConvertData | null } {
  const [data, setData] = useState<ConvertData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      const [catalog, rates, cardFeePct] = await Promise.all([
        listCurrencies(db),
        getFxRates(db),
        getCardFeePct(db),
      ]);
      setData({ codes: catalog.map((r) => r.code), rates, cardFeePct });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
