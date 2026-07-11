import type { EntryRow } from './schema';

export type CategoryGroup = { category: string; total: number; entries: EntryRow[] };

// Group ledger entries into category buckets, largest spend first (totals are negative — compare by
// magnitude). Entry order within a category is preserved from the input, so pass entries already in
// the order you want them listed. Mirror of groupByDate for the Records "by category" view.
export function groupByCategory(entries: EntryRow[]): CategoryGroup[] {
  const buckets = new Map<string, EntryRow[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.category);
    if (bucket) bucket.push(entry);
    else buckets.set(entry.category, [entry]);
  }

  const groups: CategoryGroup[] = [];
  for (const [category, catEntries] of buckets) {
    const total = catEntries.reduce((sum, entry) => sum + entry.amount, 0);
    groups.push({ category, total, entries: catEntries });
  }
  groups.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  return groups;
}
