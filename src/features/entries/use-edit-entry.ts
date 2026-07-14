'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getDistinctAccounts, getDistinctCategories, getEntryById } from './queries';
import { getKeypadCategories, getKeypadAccounts, getKeypadCurrencies } from './keypad-lists';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from './ui/Keypad';
import type { EntryRow } from './schema';
import { getIconSet, getCardFeePct, getFxRates, type IconSet } from '@features/settings/queries';
import { withFee } from './fx';
import { useDataVersion } from '@shared/data-version';

// The keypad now handles foreign-currency expenses too; only income stays on the full form — so the
// data shape differs by which editor the entry needs.
export type EditEntryData =
  | {
      keypadEditable: true;
      entry: EntryRow;
      categories: KeypadCategory[];
      accounts: KeypadAccount[];
      currencies: KeypadCurrency[];
      rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
      ratesAsOf: Record<string, string>;
      iconSet: IconSet;
    }
  | {
      keypadEditable: false;
      entry: EntryRow;
      accounts: string[];
      categories: string[];
    };

// Edit-entry page's data, read once via the browser OPFS db after mount — mirrors the server
// computation the page used to run in a Server Component, just moved client-side + async. A missing
// entry (bad/stale id) resolves to `data: null` once ready, rather than throwing — the page decides
// how to show that (matching Next's old notFound() outcome without a server-only API).
export function useEditEntry(id: number): { ready: boolean; data: EditEntryData | null } {
  const [data, setData] = useState<EditEntryData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const entry = await getEntryById(db, id);
      if (entry === undefined) {
        setData(null);
        setReady(true);
        return;
      }

      const keypadEditable = entry.amount < 0;
      if (keypadEditable) {
        const [iconSet, categories, accounts, currencies, cardFeePct, fxRates] = await Promise.all([
          getIconSet(db),
          getKeypadCategories(db),
          getKeypadAccounts(db),
          getKeypadCurrencies(db),
          getCardFeePct(db),
          getFxRates(db),
        ]);
        const rates: Record<string, number> = {};
        const ratesAsOf: Record<string, string> = {};
        for (const [code, e] of Object.entries(fxRates)) {
          rates[code] = withFee(e.thbPerUnit, cardFeePct);
          ratesAsOf[code] = e.asOf;
        }
        setData({
          keypadEditable: true,
          entry,
          categories,
          accounts,
          currencies,
          rates,
          ratesAsOf,
          iconSet,
        });
      } else {
        const [accounts, categories] = await Promise.all([
          getDistinctAccounts(db),
          getDistinctCategories(db),
        ]);
        setData({ keypadEditable: false, entry, accounts, categories });
      }
      setReady(true);
    })();
  }, [id, version]);

  return { ready, data };
}
