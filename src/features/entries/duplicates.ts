import type { EntryRow } from './schema';

// The fields a duplicate scan can require to match, in the order the Checkup page lists them.
export const DUPLICATE_FIELDS = ['date', 'amount', 'category', 'account', 'note'] as const;

export type DuplicateField = (typeof DUPLICATE_FIELDS)[number];

// The rule the scan shipped with, and what it still starts on: same date, same amount, same
// category.
//
// Account is off by default on purpose: paying one bill twice from two different cards is exactly
// the mistake worth catching, and keying on the account hides it. Date is exact, never a window — a
// ±1 day rule flags the entirely normal case of buying the same coffee two mornings running, and in
// a tool whose only affordance is Delete, a false positive costs more than a miss.
export const DEFAULT_DUPLICATE_FIELDS: readonly DuplicateField[] = ['date', 'amount', 'category'];

// Category and account compare by id, not by display name: that is what the entry actually stores,
// and it survives a rename. A note compares trimmed, so a null note and a whitespace-only one are
// the same note. The sign is part of the amount, so an expense never groups with the refund that
// reverses it.
function fieldValue(row: EntryRow, field: DuplicateField): string | number | null {
  switch (field) {
    case 'date':
      return row.date;
    case 'amount':
      return row.amount;
    case 'category':
      return row.categoryId;
    case 'account':
      return row.accountId;
    case 'note':
      return row.note?.trim() ?? '';
  }
}

// Rows the ledger holds more than once, grouped by the fields the caller says must match.
//
// Three writers can put a row here — the keypad, a Monefy CSV import, and the recurring sweep on app
// open — and none of them checks the others. Nothing else in the app notices when two of them land
// on the same spend.
//
// `fields` defaults to the historical rule (see DEFAULT_DUPLICATE_FIELDS). An EMPTY `fields` yields
// nothing rather than one enormous group: with nothing to key on every row shares a key. The Checkup
// UI makes that state unreachable by refusing to clear the last checkbox, but this function is
// exported and has to stay total.
//
// JSON.stringify rather than a join: a note is free text and can contain the separator.
export function findDuplicateGroups(
  rows: EntryRow[],
  fields: readonly DuplicateField[] = DEFAULT_DUPLICATE_FIELDS,
): EntryRow[][] {
  if (fields.length === 0) return [];

  const buckets = new Map<string, EntryRow[]>();
  for (const row of rows) {
    const key = JSON.stringify(fields.map((field) => fieldValue(row, field)));
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [row]);
    else bucket.push(row);
  }

  const groups: EntryRow[][] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    // Oldest id first: whichever row was written first reads as the original, and the ones under it
    // as the suspects. That ordering is the only guidance the list gives about which to delete.
    groups.push([...bucket].sort((a, b) => a.id - b.id));
  }

  // Newest first, by the oldest row in each group. When `date` is one of the fields every row in a
  // group shares it, so this is simply the group's date; when it is not, the rows may span dates and
  // this picks one deterministically. Never recover the date from the key — the key's shape is now
  // the caller's choice, and slicing it would read whichever field happens to come first.
  return groups.sort((a, b) => (a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : 0));
}
