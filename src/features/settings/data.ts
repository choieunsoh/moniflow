import type { Db } from '@db/client';
import { entries } from '@features/entries/schema';
import { categories } from '@features/categories/schema';
import { budgets } from '@features/budgets/schema';

// Irreversible "wipe all data": clears the whole ledger, all categories, and their budgets in one
// transaction (no soft-delete — that's the point, and why the UI confirm-gates it). Entries and
// budgets reference categories, so they're deleted first.
// ponytail: the accounts table is added by the accounts feature (concern #1); extend this to also
// `tx.delete(accounts).run()` when that table lands.
export async function wipeAllData(db: Db): Promise<void> {
  await db.batch([db.delete(entries), db.delete(budgets), db.delete(categories)]);
}
