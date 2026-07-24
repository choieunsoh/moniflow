import { postsBetween, type Rule } from './schedule';

// A rule as this module needs it: the schedule subset plus its money fields. `Recurrence` (schema.ts)
// is structurally assignable, so a DB row passes with no mapping.
export type CommittedRule = Rule & { amount: number; rate: number | null };

export type Committed = { total: number; count: number };

// Total (in THB) and count of every recurring bill that will post after `todayIso`, through
// `cycleEndIso` inclusive. Feeds the dashboard's safe-to-spend so known future bills are reserved.
//
// ponytail: a live-FX rule (foreign currency, rate null) is estimated at its face amount — we can't
// convert without the network, and a pure fn must not fetch. Pinned-rate rules convert exactly
// (amount × rate). THB rules have rate null → × 1. Upgrade path if foreign recurring bills ever
// matter: thread recurring/rates.ts convertAmount through an async variant at the hook boundary.
export function committedThisCycle(
  rules: CommittedRule[],
  todayIso: string,
  cycleEndIso: string,
): Committed {
  let total = 0;
  let count = 0;
  for (const rule of rules) {
    const posts = postsBetween(rule, todayIso, cycleEndIso);
    count += posts.length;
    total += posts.length * rule.amount * (rule.rate ?? 1);
  }
  return { total, count };
}
