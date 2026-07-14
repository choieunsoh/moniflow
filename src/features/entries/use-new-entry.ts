'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getLatestAccount } from './queries';
import { getKeypadCategories, getKeypadAccounts, getKeypadCurrencies } from './keypad-lists';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from './ui/Keypad';
import { getIconSet, getCardFeePct, getFxRates, type IconSet } from '@features/settings/queries';
import { withFee } from './fx';
import { useDataVersion } from '@shared/data-version';

export type NewEntryData = {
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  defaultAccount: string;
  iconSet: IconSet;
};

// New-entry page's keypad-feeding lists, read once via the browser OPFS db after mount — mirrors the
// server computation the page used to run in a Server Component, just moved client-side + async.
export function useNewEntry(): { ready: boolean; data: NewEntryData | null } {
  const [data, setData] = useState<NewEntryData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const [iconSet, categories, accounts, currencies, cardFeePct, fxRates, latestAccount] =
        await Promise.all([
          getIconSet(db),
          getKeypadCategories(db),
          getKeypadAccounts(db),
          getKeypadCurrencies(db),
          getCardFeePct(db),
          getFxRates(db),
          getLatestAccount(db),
        ]);

      const rates: Record<string, number> = {};
      const ratesAsOf: Record<string, string> = {};
      for (const [code, e] of Object.entries(fxRates)) {
        rates[code] = withFee(e.thbPerUnit, cardFeePct); // effective, fee-inclusive
        ratesAsOf[code] = e.asOf;
      }
      // Default to the account last used so the common case (same account again) is zero taps.
      const defaultAccount = latestAccount ?? accounts[0]?.name ?? '';

      setData({ categories, accounts, currencies, rates, ratesAsOf, defaultAccount, iconSet });
      setReady(true);
    })();
  }, [version]);

  return { ready, data };
}
