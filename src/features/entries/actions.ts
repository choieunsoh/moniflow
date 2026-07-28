import { getBrowserDb } from '@db/browser';
import { parseEntryForm } from './entry-form';
import { tripId } from './trips';
import {
  insertEntry,
  updateEntry,
  deleteEntry,
  renameCategory,
  deleteCategory,
  setTripTitle,
  restoreEntries,
} from './queries';
import { parseMergeInput } from './merge-input';
import { parseMonefyCsv } from './import';
import { addCategory } from '@features/categories/queries';
import { rewindRecurrences } from '@features/recurring/queries';
import { bumpDataVersion } from '@shared/data-version';
import { getCurrencyCodes } from '@features/currencies/queries';

// The feature's write layer, now client-side against the browser OPFS db (offline-first — no
// 'use server'/revalidatePath; the worker bootstraps tables). React 19 form actions accept these client
// functions directly, so call sites are unchanged. A failed parse throws — the caller's boundary/catch
// surfaces it. Each successful write bumps the shared data-version store so live read-hooks refetch.
// ponytail(Plan 2b): addEntry/editEntry no longer navigate (redirect was a server-only API) — the calling
// forms will push the route themselves in 2b. The writes persist to OPFS now regardless.
export async function addEntryAction(formData: FormData): Promise<void> {
  const db = await getBrowserDb();
  const validCodes = await getCurrencyCodes(db);
  const result = parseEntryForm(formData, validCodes);
  if (!result.ok) {
    throw new Error(result.error);
  }
  await insertEntry(db, result.entry);
  bumpDataVersion();
  // TODO(Plan 2b): navigate to '/' from the caller.
}

export async function editEntryAction(formData: FormData): Promise<void> {
  const db = await getBrowserDb();
  const validCodes = await getCurrencyCodes(db);
  const result = parseEntryForm(formData, validCodes);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const id = Number(formData.get('id'));
  await updateEntry(db, id, result.entry);
  bumpDataVersion();
  // TODO(Plan 2b): navigate to '/records' from the caller.
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await deleteEntry(db, id);
  bumpDataVersion();
}

export async function mergeCategoryAction(formData: FormData): Promise<void> {
  const input = parseMergeInput(formData);
  if (input === null) return;

  const db = await getBrowserDb();
  await renameCategory(db, input.from, input.to); // rename, or merge when `to` already exists
  bumpDataVersion();
}

// Name (or rename) a trip. Called directly with args from the Trips rename dialog; an empty title clears
// the name. Keyed by the trip's stable id so the name survives later entries in the trip.
export async function renameTrip(currency: string, start: string, title: string): Promise<void> {
  const db = await getBrowserDb();
  await setTripTitle(db, tripId(currency, start), title);
  bumpDataVersion();
}

// Create an empty category. Trimmed; blank is ignored. Duplicate names no-op in addCategory.
export async function addCategoryAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name.trim()) return;

  const db = await getBrowserDb();
  await addCategory(db, name.trim());
  bumpDataVersion();
}

// Delete a category. deleteCategory guards emptiness, so a non-empty one is a no-op even if the UI somehow
// submits it — the button is only shown at count 0.
export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name) return;

  const db = await getBrowserDb();
  await deleteCategory(db, name);
  bumpDataVersion();
}

// Restore the entire ledger from a Monefy-compatible CSV. Replace-all: parse, then restoreEntries wipes
// every existing entry and loads the file's rows. The caller (ImportBackup) reads the file + confirms first.
// Returns counts so the client can toast a summary. An empty/all-income file yields 0 entries (parseMonefyCsv
// does not throw); this refuses that — it throws before restoreEntries, so such a file can never silently
// clear the ledger.
//
// The CSV carries no rule id, so after a replace-all the ledger and the recurring rules are strangers: a
// rule may claim it posted through July while the restored ledger stops in June. Clamping every pointer to
// the CSV's newest date makes the next sweep refill the gap, and because the payment number derives from
// that pointer (schedule.ts), the installment seq numbers come back correct for free.
export async function importBackupAction(
  csvText: string,
): Promise<{ imported: number; skipped: number }> {
  const { entries: rows, skipped } = parseMonefyCsv(csvText);
  if (rows.length === 0) {
    throw new Error('Backup contained no importable entries');
  }
  const db = await getBrowserDb();
  await restoreEntries(db, rows);
  // Max over the already-parsed rows — no second pass over the text. The empty guard above means
  // this is always defined.
  const maxDate = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
  await rewindRecurrences(db, maxDate);
  bumpDataVersion();
  return { imported: rows.length, skipped };
}
