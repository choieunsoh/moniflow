'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { useDataVersion } from '@shared/data-version';
import { withFee } from '@features/entries/fx';
import { getCardFeePct, getFxRates } from '@features/settings/queries';
import { listRules } from './queries';
import { progressOf, type Progress } from './schedule';
import type { Recurrence } from './schema';

export type RuleView = Recurrence & { progress: Progress; monthlyThb: number };

// A rule's contribution to the "committed per month" figure. A yearly rule is amortised. An FX rule
// is valued at its pinned rate, or — failing that — at the CACHED effective rate, which is a local
// read (the same cache the keypad prices against), not a network call.
//
// It used to fall back to 0, which made a live-rate subscription contribute nothing: two rules, one
// of them $9.99/mo, still read "฿2,000 / month". A glance figure may be approximate; it may not be
// silently wrong. 0 remains the last resort for a currency with no rate cached at all — there is
// genuinely no honest number to show then, and inventing one would be worse.
function monthlyThbOf(rule: Recurrence, effectiveRates: Record<string, number>): number {
  const isThb = rule.currency === null || rule.currency === 'THB';
  const rate = isThb ? 1 : (rule.rate ?? effectiveRates[rule.currency ?? ''] ?? 0);
  return (rule.amount * rate) / rule.intervalMonths;
}

// The /recurring page's list + total, read once via the browser OPFS db after mount and refetched
// whenever the data-version bumps (a write from the form or the sweep). Only `listRules` comes from
// './queries' — category/account display names are resolved separately by useRecurringCatalog, so
// this hook's test can mock './queries' down to that one function.
export function useRecurring(): { ready: boolean; rules: RuleView[]; monthlyTotal: number } {
  const version = useDataVersion();
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState<RuleView[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const [rows, fxRates, cardFeePct] = await Promise.all([
        listRules(db),
        getFxRates(db),
        getCardFeePct(db),
      ]);
      if (!alive) return;

      // Fee-inclusive, matching what the sweep will actually charge a foreign post — the cache holds
      // the ECB mid rate and the fee is layered at conversion time.
      const effectiveRates: Record<string, number> = {};
      for (const [code, e] of Object.entries(fxRates)) {
        effectiveRates[code] = withFee(e.thbPerUnit, cardFeePct);
      }

      setRules(
        rows.map((r) => ({
          ...r,
          progress: progressOf(r),
          monthlyThb: monthlyThbOf(r, effectiveRates),
        })),
      );
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  return { ready, rules, monthlyTotal: rules.reduce((sum, r) => sum + r.monthlyThb, 0) };
}
