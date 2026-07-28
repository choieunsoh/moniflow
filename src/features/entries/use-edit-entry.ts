'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import {
  getDistinctAccounts,
  getDistinctCategories,
  getDistinctNotes,
  getEntryById,
} from './queries';
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
import { listCurrencies, getAllCurrencyCodes } from '@features/currencies/queries';
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
      currencyCodes: Set<string>; // the catalog's valid codes, for isCurrency
      notes: string[]; // the note field's autocomplete pool
      rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
      ratesAsOf: Record<string, string>;
      iconSet: IconSet;
      keypadLayout: KeypadLayout;
      offBudgetCategories: Set<string>; // the Keypad's off-budget toggle default
    }
  | {
      keypadEditable: false;
      entry: EntryRow;
      accounts: string[];
      categories: string[];
      currencies: string[]; // catalog codes for the plain EntryForm's currency <select>
      notes: string[];
      offBudgetCategories: Set<string>; // the plain EntryForm's off-budget toggle default
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

      const keypadEditable = entry.amount < 0;
      if (keypadEditable) {
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
          offBudgetCategories,
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
          currencyCodes,
          notes,
          rates,
          ratesAsOf,
          iconSet,
          keypadLayout,
          offBudgetCategories,
        });
      } else {
        const [accounts, categories, currencyRows, notes, offBudgetCategories] = await Promise.all([
          getDistinctAccounts(db),
          getDistinctCategories(db),
          listCurrencies(db),
          getDistinctNotes(db),
          getOffBudgetCategories(db),
        ]);
        const currencies = currencyRows.map((r) => r.code);
        setData({
          keypadEditable: false,
          entry,
          accounts,
          categories,
          currencies,
          notes,
          offBudgetCategories,
        });
      }
      setReady(true);
    });
  }, [id, version]);

  return { ready, data };
}
