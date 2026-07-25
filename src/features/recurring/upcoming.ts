import { postsBetween, type Rule } from './schedule';

// A rule as this module needs it: the schedule subset plus its money fields. `Recurrence` (schema.ts)
// is structurally assignable, so a DB row passes with no mapping.
export type CommittedRule = Rule & { amount: number; rate: number | null; currency: string | null };

// `total` is the THB-equivalent that feeds safe-to-spend. `byCurrency` is for DISPLAY: THB-valued
// bills (plain THB + pinned-rate foreign, already converted) collapse into one 'THB' bucket; a
// blank-rate foreign bill can't be converted by a pure preview, so it shows in its OWN currency
// (e.g. $107) rather than a misleading ฿107.
export type Committed = {
  total: number;
  count: number;
  byCurrency: { currency: string; amount: number }[];
};

// Total (in THB) and count of every recurring bill that will post after `todayIso`, through
// `cycleEndIso` inclusive. Feeds the dashboard's safe-to-spend so known future bills are reserved.
//
// ponytail: a live-FX rule (foreign currency, rate null) is counted toward `total` at its FACE amount
// — a pure fn can't fetch to convert. That under-reserves safe-to-spend (documented ceiling), but the
// display no longer lies: byCurrency keeps such a bill in its own currency. Pinned-rate rules convert
// exactly (amount × rate); THB rules have rate null → × 1. Upgrade path if foreign recurring bills
// ever need true reservation: thread recurring/rates.ts convertAmount through an async variant at the
// hook boundary.
export function committedThisCycle(
  rules: CommittedRule[],
  todayIso: string,
  cycleEndIso: string,
): Committed {
  let total = 0;
  let count = 0;
  const buckets = new Map<string, number>();
  for (const rule of rules) {
    const posts = postsBetween(rule, todayIso, cycleEndIso);
    if (posts.length === 0) continue;
    count += posts.length;
    // Plain THB, or foreign-but-pinned: a real THB figure. Blank-rate foreign: shown in its currency.
    if (rule.currency === null || rule.currency === 'THB' || rule.rate !== null) {
      const thb = posts.length * rule.amount * (rule.rate ?? 1);
      total += thb;
      buckets.set('THB', (buckets.get('THB') ?? 0) + thb);
    } else {
      const face = posts.length * rule.amount;
      total += face;
      buckets.set(rule.currency, (buckets.get(rule.currency) ?? 0) + face);
    }
  }
  return {
    total,
    count,
    byCurrency: [...buckets].map(([currency, amount]) => ({ currency, amount })),
  };
}
