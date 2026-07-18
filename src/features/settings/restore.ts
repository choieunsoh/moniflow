'use client';

import { getBrowserDb } from '@db/browser';
import type { CatalogData } from './catalog';
import { parseMonefyCsv } from '@features/entries/import';
import { restoreEntries } from '@features/entries/queries';
import { rewindRecurrences, restoreRecurrencesFromCatalog } from '@features/recurring/queries';
import { restoreCategoryCatalog } from '@features/categories/queries';
import { restoreAccountCatalog } from '@features/accounts/queries';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';

// `entries` is null for a v1/v2 catalog file (the ledger isn't part of it, so it's untouched) and a
// count for a v3 combined file (0 means the backup's ledger was empty and the current one was cleared
// to match).
export type RestoreSummary = { entries: number | null; categories: number; accounts: number };

// Apply a combined (v3) or catalog-only (v1/v2) backup in one shot. Two different semantics on purpose,
// mirroring the two things they replaced: category/account/rule metadata MERGES (upsert-by-name, never
// deletes); entries — present only in v3 — REPLACE the whole ledger. Metadata goes first so an entry's
// category/account already carries its emoji/hue before the ledger loads. One bumpDataVersion at the end.
//
// The ledger replace reuses the CSV path's rewind (rewindRecurrences to the newest entry date) so the
// recurring rules and the freshly-loaded ledger don't drift — same reasoning as importBackupAction.
export async function restoreBackupAction(data: CatalogData): Promise<RestoreSummary> {
  const db = await getBrowserDb();
  await restoreCategoryCatalog(db, data.categories);
  await restoreAccountCatalog(db, data.accounts);
  await restoreRecurrencesFromCatalog(db, data.recurrences, todayIso());

  let entries: number | null = null;
  if (data.entriesCsv !== undefined) {
    const rows = parseMonefyCsv(data.entriesCsv).entries;
    await restoreEntries(db, rows); // replace-all; an empty array clears the ledger to match the backup
    if (rows.length > 0) {
      const maxDate = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
      await rewindRecurrences(db, maxDate);
    }
    entries = rows.length;
  }
  bumpDataVersion();
  return { entries, categories: data.categories.length, accounts: data.accounts.length };
}
