import type { Bar } from '@features/entries/breakdown';

// A stored ledger amount is negative for an expense and positive for a refund, so on `bars`
// (built by toBars, which floors at 0) a dropped account has total >= 0: either its refunds
// outweighed its spend (total > 0, a genuine refund) or spend and refunds cancelled out exactly
// (total === 0, pct === 0 too but nothing moved). Filtering on `pct <= 0` catches both, so it
// would name a net-zero account in the footnote despite it moving no money at all. Strict
// `total > 0` is the one case that means this account actually took in more than it spent,
// the same predicate Home uses for its own refundedCategories.
export function refundedAccountBars(bars: Bar[]): Bar[] {
  return bars.filter((b) => b.total > 0);
}
