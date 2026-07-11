import type { EntryRow } from './schema';

export type DayGroup = { date: string; total: number; entries: EntryRow[] };

// Group ledger entries into day buckets, newest day first, with the signed day total (expenses are
// negative). Entry order within a day is preserved from the input, so pass entries already in the
// order you want them listed under each day.
export function groupByDate(entries: EntryRow[]): DayGroup[] {
  const buckets = new Map<string, EntryRow[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.date);
    if (bucket) bucket.push(entry);
    else buckets.set(entry.date, [entry]);
  }

  const groups: DayGroup[] = [];
  for (const [date, dayEntries] of buckets) {
    const total = dayEntries.reduce((sum, entry) => sum + entry.amount, 0);
    groups.push({ date, total, entries: dayEntries });
  }
  groups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return groups;
}
