import type { EntryRow } from './schema';

// Rows the ledger holds twice: same date, same amount, same category.
//
// Three writers can put a row here — the keypad, a Monefy CSV import, and the recurring sweep on app
// open — and none of them checks the others. Nothing else in the app notices when two of them land
// on the same spend.
//
// Account is deliberately NOT part of the key: paying one bill twice from two different cards is
// exactly the mistake worth catching, and keying on the account would hide it. Nor is there a date
// window — a ±1 day rule flags the entirely normal case of buying the same coffee two mornings
// running, and in a tool whose only affordance is Delete, a false positive costs more than a miss.
//
// The sign is part of the amount, so an expense never groups with the refund that reverses it.
export function findDuplicateGroups(rows: EntryRow[]): EntryRow[][] {
  const buckets = new Map<string, EntryRow[]>();
  for (const row of rows) {
    const key = `${row.date}|${row.amount}|${row.categoryId}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [row]);
    else bucket.push(row);
  }

  const groups: { date: string; rows: EntryRow[] }[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;
    // Oldest id first: whichever row was written first reads as the original, and the ones under it
    // as the suspects. That ordering is the only guidance the list gives about which to delete.
    groups.push({
      date: key.slice(0, key.indexOf('|')),
      rows: [...bucket].sort((a, b) => a.id - b.id),
    });
  }

  return groups.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map((g) => g.rows);
}
