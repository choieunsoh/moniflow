import type { EntryRow } from './schema';

// How many of the cycle's largest single expenses the Home panel shows. Small — this is a glance at
// the outliers, not a full list (that's Records → ?sort=amount). Tunable in one place.
export const TOP_TX_LIMIT = 5;

// The cycle's biggest single expenses, biggest first. The category breakdown answers "which buckets",
// top-notes answers "which merchants"; this answers "which single purchases blew the cycle". Ranks by
// magnitude (the ledger stores outflows negative) and copies the array before sorting so the caller's
// order (e.g. the chronological cycle list) is untouched.
export function topTransactions(entries: EntryRow[], limit: number = TOP_TX_LIMIT): EntryRow[] {
  return [...entries].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, limit);
}
