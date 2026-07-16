import type { Db } from '@db/client';
import { entries } from '@features/entries/schema';
import { categories } from '@features/categories/schema';
import { budgets } from '@features/budgets/schema';
import { recurrences } from '@features/recurring/schema';

// Irreversible "wipe all data": clears the whole ledger, all categories, their budgets, and every
// recurring rule in one transaction (no soft-delete — that's the point, and why the UI confirm-gates
// it). Entries and budgets reference categories, so they're deleted first.
//
// Rules MUST be cleared here: left behind, the next sweep would re-post every one of them from its
// startDate and quietly undo the wipe.
// ponytail: the accounts table is still not cleared here (pre-existing gap from the accounts
// feature); fold it in when someone touches this next.
export async function wipeAllData(db: Db): Promise<void> {
  await db.batch([
    db.delete(entries),
    db.delete(budgets),
    db.delete(recurrences),
    db.delete(categories),
  ]);
}
