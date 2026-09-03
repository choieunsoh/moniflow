import type { Breakdown } from './queries';

export type RefundedSummary = { refunded: number; categories: string[] };

// The Home ring draws gross magnitudes while `total` is the signed net; the gap between them is
// the refunded amount, and the categories it came from are the ones that netted positive (a stored
// amount is negative for an expense, so a category netting positive is one that handed money back).
//
// `refunded` used to come from `grossSpend - total`: two INDEPENDENTLY accumulated float sums
// (one from a SQL sum() per category group, one from a JS reduce over every row in id order) that
// are algebraically identical but not bitwise identical across thousands of floats. On a cycle with
// no refunds at all the residual could land at something like +1.8e-12, which is > 0, so the card
// printed "฿0 refunded" with an empty category list — refunded > 0 but no category to name.
//
// Deriving both figures from the SAME filtered set closes that gap structurally: each row's total
// is a single SQL sum and strictly positive, so the amount and the category list can no longer
// disagree. Mirrors refundedAccountBars in @features/accounts/ring-footnote for the identical
// reason on /accounts.
export function refundedSummary(categoryBreakdown: Breakdown[]): RefundedSummary {
  const refundedRows = categoryBreakdown.filter((r) => r.total > 0);
  return {
    refunded: refundedRows.reduce((sum, r) => sum + r.total, 0),
    categories: refundedRows.map((r) => r.key),
  };
}
