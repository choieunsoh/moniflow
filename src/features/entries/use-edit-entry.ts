'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getDistinctNotes, getEntryById } from './queries';
import { getKeypadCategories, getKeypadAccounts, getKeypadCurrencies } from './keypad-lists';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from './ui/Keypad';
import type { EntryRow } from './schema';
import {
  getIconSet,
  getCardFeePct,
  getFxRates,
  getKeypadLayout,
  type IconSet,
  type KeypadLayout,
} from '@features/settings/queries';
import { getOffBudgetCategories } from '@features/categories/queries';
import { getAllCurrencyCodes, getTravelCurrencies } from '@features/currencies/queries';
import { withFee } from './fx';
import { useDataVersion } from '@shared/data-version';

// One editor for every row. Refunds used to fall through to a separate long form here, back when the
// keypad could only key an expense; it grew a "Money received (refund)" toggle and reads a positive
// row's own sign, so the sign no longer picks an editor.
export type EditEntryData = {
  entry: EntryRow;
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  currencyCodes: Set<string>; // the catalog's valid codes, for isCurrency
  notes: string[]; // the note field's autocomplete pool
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  iconSet: IconSet;
  keypadLayout: KeypadLayout;
  offBudgetCategories: Set<string>; // the Keypad's off-budget toggle default
  travelCurrencies: Set<string>; // the Keypad's off-budget toggle default, travel-currency tier
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
    void withDb(async (db) => {
      setReady(false);
      const entry = await getEntryById(db, id);
      if (entry === undefined) {
        setData(null);
        setReady(true);
        return;
      }

      const [
        iconSet,
        keypadLayout,
        categories,
        accounts,
        currencies,
        allCurrencyCodes,
        notes,
        cardFeePct,
        fxRates,
        offBudgetCategories,
        travelCurrencies,
      ] = await Promise.all([
        getIconSet(db),
        getKeypadLayout(db),
        getKeypadCategories(db),
        getKeypadAccounts(db),
        getKeypadCurrencies(db),
        // All codes, archived included — this feeds the keypad's isCurrency recognition of the
        // entry it's editing, not what a new save may pick. getCurrencyCodes (non-archived) would
        // make an archived-currency row unrecognisable and fall back to THB (see use-new-entry.ts,
        // which correctly keeps getCurrencyCodes for its NEW-entry case).
        getAllCurrencyCodes(db),
        getDistinctNotes(db),
        getCardFeePct(db),
        getFxRates(db),
        getOffBudgetCategories(db),
        getTravelCurrencies(db),
      ]);
      // getAllCurrencyCodes covers every catalog row, archived included, but not a code that was
      // never a catalog row at all — reachable via importBackupAction with a raw Monefy CSV
      // carrying a code the catalog has never seen (e.g. CNY). Without this, such a row falls back
      // to THB in the Keypad (Keypad.tsx's initialCurrency) and a save rewrites its currency and
      // drops originalAmount — mirrors editEntryAction's write-time guard, which already keeps an
      // entry's own currency recognised regardless of catalog membership.
      const currencyCodes = new Set(allCurrencyCodes);
      if (entry.currency !== null) currencyCodes.add(entry.currency);
      const rates: Record<string, number> = {};
      const ratesAsOf: Record<string, string> = {};
      for (const [code, e] of Object.entries(fxRates)) {
        rates[code] = withFee(e.thbPerUnit, cardFeePct);
        ratesAsOf[code] = e.asOf;
      }
      setData({
        entry,
        categories,
        accounts,
        currencies,
        currencyCodes,
        notes,
        rates,
        ratesAsOf,
        iconSet,
        keypadLayout,
        offBudgetCategories,
        travelCurrencies,
      });
      setReady(true);
    });
  }, [id, version]);

  return { ready, data };
}
