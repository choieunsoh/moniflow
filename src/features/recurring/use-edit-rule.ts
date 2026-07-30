'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import {
  getKeypadCategories,
  getKeypadAccounts,
  getKeypadCurrencies,
} from '@features/entries/keypad-lists';
import type { KeypadCategory, KeypadAccount, KeypadCurrency } from '@features/entries/ui/Keypad';
import { withFee } from '@features/entries/fx';
import {
  getIconSet,
  getCardFeePct,
  getFxRates,
  getKeypadLayout,
  type IconSet,
  type KeypadLayout,
} from '@features/settings/queries';
import { useDataVersion } from '@shared/data-version';
import { getRule, listRuleMeta } from './queries';
import type { Recurrence } from './schema';
import { getAllCurrencyCodes } from '@features/currencies/queries';

export type EditRuleData = {
  rule: Recurrence;
  // The rule stores ids; the keypad works in NAMES (its category tiles submit a name, and the write
  // layer resolves it back). These are the current ones, so the form can mark them as selected.
  category: string;
  account: string;
  categories: KeypadCategory[];
  accounts: KeypadAccount[];
  currencies: KeypadCurrency[];
  currencyCodes: Set<string>; // the catalog's valid codes, for isCurrency
  rates: Record<string, number>; // effective (fee-inclusive) THB per 1 unit, by code
  ratesAsOf: Record<string, string>;
  iconSet: IconSet;
  keypadLayout: KeypadLayout;
};

// Edit-rule page's data, read once via the browser OPFS db after mount — the same shape useEditEntry
// provides for the ledger's keypad, since the rule keypad needs the same feeding lists. A missing rule
// (bad/stale id) resolves to `data: null` once ready rather than throwing; the page decides how to
// show that.
export function useEditRule(id: number): { ready: boolean; data: EditRuleData | null } {
  const [data, setData] = useState<EditRuleData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    let alive = true;
    void withDb(async (db) => {
      setReady(false);
      const rule = await getRule(db, id);
      if (rule === undefined) {
        if (!alive) return;
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
        currencyCodes,
        cardFeePct,
        fxRates,
        meta,
      ] = await Promise.all([
        getIconSet(db),
        getKeypadLayout(db),
        getKeypadCategories(db),
        getKeypadAccounts(db),
        getKeypadCurrencies(db),
        // All codes, archived included — feeds RuleKeypad's isCurrency recognition of the rule
        // being edited, not what a new save may pick (same reasoning as use-edit-entry.ts).
        getAllCurrencyCodes(db),
        getCardFeePct(db),
        getFxRates(db),
        listRuleMeta(db),
      ]);
      if (!alive) return;

      const rates: Record<string, number> = {};
      const ratesAsOf: Record<string, string> = {};
      for (const [code, e] of Object.entries(fxRates)) {
        rates[code] = withFee(e.thbPerUnit, cardFeePct); // effective, fee-inclusive
        ratesAsOf[code] = e.asOf;
      }

      const own = meta.find((m) => m.id === id);
      setData({
        rule,
        category: own?.categoryName ?? '',
        account: own?.accountName ?? '',
        categories,
        accounts,
        currencies,
        currencyCodes,
        rates,
        ratesAsOf,
        iconSet,
        keypadLayout,
      });
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [id, version]);

  return { ready, data };
}
