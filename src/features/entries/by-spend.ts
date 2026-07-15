import type { EntryRow } from './schema';

export type SpendGroup = { key: string; total: number; entries: EntryRow[] };

// Group ledger entries into buckets ranked by spend — largest first (totals are negative, so compare
// by magnitude). `keyOf` picks the bucket: `e => e.category` for the Records "by category" tab,
// `e => e.account` for "by account". Entry order within a bucket is preserved from the input, so pass
// entries already in the order you want them listed.
//
// ponytail: one keyed function rather than a by-category/by-account pair — they differed only by the
// accessor, and callers discard the bucket's field name anyway (useRecords maps every group to a
// uniform {key, entries, total, foreign} section). Sibling of groupByDate, which stays separate
// because it ranks chronologically, not by spend.
export function groupBySpend(
  entries: EntryRow[],
  keyOf: (entry: EntryRow) => string,
): SpendGroup[] {
  const buckets = new Map<string, EntryRow[]>();
  for (const entry of entries) {
    const key = keyOf(entry);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  const groups: SpendGroup[] = [];
  for (const [key, bucketEntries] of buckets) {
    const total = bucketEntries.reduce((sum, entry) => sum + entry.amount, 0);
    groups.push({ key, total, entries: bucketEntries });
  }
  groups.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return groups;
}
