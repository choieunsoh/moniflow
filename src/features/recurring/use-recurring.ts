'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { useDataVersion } from '@shared/data-version';
import { listRules } from './queries';
import { progressOf, type Progress } from './schedule';
import type { Recurrence } from './schema';

export type RuleView = Recurrence & { progress: Progress; monthlyThb: number };

// A rule's contribution to the "committed per month" figure. A yearly rule is amortised; an FX rule
// is valued at its pinned rate, or skipped (0) when it has none — the header is a GLANCE figure, and
// hitting the network to price it would be absurd for a number that renders in whole baht.
function monthlyThbOf(rule: Recurrence): number {
  const thb =
    rule.currency === null || rule.currency === 'THB'
      ? rule.amount
      : rule.amount * (rule.rate ?? 0);
  return thb / rule.intervalMonths;
}

// The /recurring page's list + total, read once via the browser OPFS db after mount and refetched
// whenever the data-version bumps (a write from the form or the sweep). Deliberately narrow: it only
// calls `listRules` from './queries' — category/account display names are resolved separately by
// useRecurringCatalog, so this hook's test can mock './queries' down to just that one function.
export function useRecurring(): { ready: boolean; rules: RuleView[]; monthlyTotal: number } {
  const version = useDataVersion();
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState<RuleView[]>([]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const rows = await listRules(db);
      if (!alive) return;
      setRules(rows.map((r) => ({ ...r, progress: progressOf(r), monthlyThb: monthlyThbOf(r) })));
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [version]);

  return { ready, rules, monthlyTotal: rules.reduce((sum, r) => sum + r.monthlyThb, 0) };
}
