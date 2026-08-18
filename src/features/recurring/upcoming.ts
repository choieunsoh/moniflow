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
// `cycleEndIso` inclusive. Reserves known future bills out of the budget ceiling and safe-to-spend.
//
// `thbPerUnit` carries EFFECTIVE (fee-inclusive) rates by currency code, so a live-FX rule — foreign
// currency with no pinned rate — reserves real money. It used to be counted at its FACE amount for
// want of a rate this pure function could reach, which made a $107 bill reserve ฿107: a ~30x
// under-reservation that was a tolerable nudge while this figure only shaded safe-to-spend, and a
// lie in the headline once it began setting the budget ceiling. The caller supplies the map from the
// LOCALLY CACHED fixings (settings' fx_rates + the card fee), so this costs a db read, never a fetch.
//
// A rate the map does not have leaves that bill at face value — the old behaviour, since the honest
// alternative to a missing rate is not an invented one. byCurrency keeps every foreign bill in its
// own currency either way, so the card names the money the way the statement will.
//
// Precision note: a cached fixing is not the ECB fixing on the future due date. That is fine for a
// RESERVATION — when the bill actually posts, the sweep converts it at the real fixing for that day
// and the figure self-corrects, exactly as the rule's estimated amount does.
export function committedThisCycle(
  rules: CommittedRule[],
  todayIso: string,
  cycleEndIso: string,
  thbPerUnit: ReadonlyMap<string, number> = new Map(),
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
      total += face * (thbPerUnit.get(rule.currency) ?? 1);
      buckets.set(rule.currency, (buckets.get(rule.currency) ?? 0) + face);
    }
  }
  return {
    total,
    count,
    byCurrency: [...buckets].map(([currency, amount]) => ({ currency, amount })),
  };
}
