'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getLatestAccount, getDistinctNotes } from './queries';
import { getKeypadCategories, getKeypadAccounts, getKeypadCurrencies } from './keypad-lists';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from './ui/Keypad';
import {
  getIconSet,
  getCardFeePct,
  getFxRates,
  getKeypadLayout,
  type IconSet,
  type KeypadLayout,
} from '@features/settings/queries';
import { getOffBudgetCategories } from '@features/categories/queries';
import { getCurrencyCodes, getTravelCurrencies } from '@features/currencies/queries';
import { withFee } from './fx';
import { useDataVersion } from '@shared/data-version';

export type NewEntryData = {
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  currencyCodes: Set<string>; // the catalog's valid codes, for isCurrency
  notes: string[]; // the note field's autocomplete pool
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  defaultAccount: string;
  iconSet: IconSet;
  keypadLayout: KeypadLayout;
  offBudgetCategories: Set<string>; // the Keypad's off-budget toggle default
  travelCurrencies: Set<string>; // the Keypad's off-budget toggle default, travel-currency tier
};

// New-entry page's keypad-feeding lists, read once via the browser OPFS db after mount — mirrors the
// server computation the page used to run in a Server Component, just moved client-side + async.
export function useNewEntry(): { ready: boolean; data: NewEntryData | null } {
  const [data, setData] = useState<NewEntryData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      // NOT setReady(false) on a refetch, unlike the read-only pages. The route swaps in a skeleton
      // whenever this is false, which REMOUNTS the keypad and throws away everything half-entered —
      // the amount, the note, the chosen account, which picker you were on. Seeding the starter set
      // from the empty category picker bumps the data-version and so hit exactly that: you tapped
      // "Use the starter set", got your ten categories, and found the ฿100 you had just keyed reset
      // to ฿0. The lists here are small and change rarely; showing the previous ones for the
      // handful of milliseconds a refetch takes costs nothing next to losing live input.
      const [
        iconSet,
        keypadLayout,
        categories,
        accounts,
        currencies,
        currencyCodes,
        notes,
        cardFeePct,
        fxRates,
        latestAccount,
        offBudgetCategories,
        travelCurrencies,
      ] = await Promise.all([
        getIconSet(db),
        getKeypadLayout(db),
        getKeypadCategories(db),
        getKeypadAccounts(db),
        getKeypadCurrencies(db),
        getCurrencyCodes(db),
        getDistinctNotes(db),
        getCardFeePct(db),
        getFxRates(db),
        getLatestAccount(db),
        getOffBudgetCategories(db),
        getTravelCurrencies(db),
      ]);

      const rates: Record<string, number> = {};
      const ratesAsOf: Record<string, string> = {};
      for (const [code, e] of Object.entries(fxRates)) {
        rates[code] = withFee(e.thbPerUnit, cardFeePct); // effective, fee-inclusive
        ratesAsOf[code] = e.asOf;
      }
      // Default to the account last used so the common case (same account again) is zero taps.
      const defaultAccount = latestAccount ?? accounts[0]?.name ?? '';

      setData({
        categories,
        accounts,
        currencies,
        currencyCodes,
        notes,
        rates,
        ratesAsOf,
        defaultAccount,
        iconSet,
        keypadLayout,
        offBudgetCategories,
        travelCurrencies,
      });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
