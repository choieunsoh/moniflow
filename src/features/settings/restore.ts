'use client';

import { getBrowserDb } from '@db/browser';
import type { CatalogData } from './catalog';
import { parseMonefyCsv } from '@features/entries/import';
import { restoreEntries } from '@features/entries/queries';
import { rewindRecurrences, restoreRecurrencesFromCatalog } from '@features/recurring/queries';
import { restoreCategoryCatalog } from '@features/categories/queries';
import { restoreAccountCatalog } from '@features/accounts/queries';
import { restoreBudgetCatalog } from '@features/budgets/queries';
import { restoreCurrencyCatalog } from '@features/currencies/queries';
import { restoreSettings } from './queries';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';

// `entries` is null for a v1/v2 catalog file (the ledger isn't part of it, so it's untouched) and a
// count for a v3 combined file (0 means the backup's ledger was empty and the current one was cleared
// to match). `budgets` counts the budgets restored (0 for v1/v2, which don't carry them).
export type RestoreSummary = {
  entries: number | null;
  categories: number;
  accounts: number;
  budgets: number;
};

// Apply a combined (v4/v3) or catalog-only (v1/v2) backup in one shot. Two different semantics on
// purpose: standing config — categories, accounts, currencies, rules, budgets, settings — all MERGE
// (upsert-by-name/key/code, never deletes); entries — present only in v3+ — REPLACE the whole ledger.
// Category/account/currency metadata goes first so an entry's or budget's category already carries
// its emoji/hue, and an entry's currency already exists in the catalog, before it loads. One
// bumpDataVersion at the end.
//
// The ledger replace reuses the CSV path's rewind (rewindRecurrences to the newest entry date) so the
// recurring rules and the freshly-loaded ledger don't drift — same reasoning as importBackupAction.
export async function restoreBackupAction(data: CatalogData): Promise<RestoreSummary> {
  const db = await getBrowserDb();
  await restoreCategoryCatalog(db, data.categories);
  await restoreAccountCatalog(db, data.accounts);
  if (data.currencies !== undefined) await restoreCurrencyCatalog(db, data.currencies);
  await restoreRecurrencesFromCatalog(db, data.recurrences, todayIso());

  const budgets = data.budgets ?? [];
  await restoreBudgetCatalog(db, budgets); // after categories so budget category names resolve to ids
  if (data.settings !== undefined) await restoreSettings(db, data.settings);

  let entries: number | null = null;
  if (data.entriesCsv !== undefined) {
    const rows = parseMonefyCsv(data.entriesCsv).entries;
    await restoreEntries(db, rows); // replace-all; an empty array clears the ledger to match the backup
    // Rewind unconditionally — an empty ledger needs it MOST. Guarding this on rows.length > 0 left
    // every rule pointing at entries the wipe had just deleted, and the sweep, believing it had
    // already posted them, never refilled the gap. null is the empty-ledger target (see rewindRecurrences).
    const maxDate = rows.reduce<string | null>(
      (max, r) => (max === null || r.date > max ? r.date : max),
      null,
    );
    await rewindRecurrences(db, maxDate);
    entries = rows.length;
  }
  bumpDataVersion();
  return {
    entries,
    categories: data.categories.length,
    accounts: data.accounts.length,
    budgets: budgets.length,
  };
}
