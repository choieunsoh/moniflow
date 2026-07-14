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

// The feature's write layer, now client-side against the browser OPFS db (offline-first — no
// 'use server'/revalidatePath; the worker bootstraps tables). React 19 form actions accept these client
// functions directly, so call sites are unchanged. A failed parse throws — the caller's boundary/catch
// surfaces it.
// ponytail(Plan 2b): (1) no post-write refresh yet — surfaces repaint on next load/nav until a reactive
// store lands; (2) addEntry/editEntry no longer navigate (redirect was a server-only API) — the calling
// forms will push the route themselves in 2b. The writes persist to OPFS now regardless.
export async function addEntryAction(formData: FormData): Promise<void> {
  const result = parseEntryForm(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const db = await getBrowserDb();
  await insertEntry(db, result.entry);
  // TODO(Plan 2b): navigate to '/' from the caller.
}

export async function editEntryAction(formData: FormData): Promise<void> {
  const result = parseEntryForm(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await updateEntry(db, id, result.entry);
  // TODO(Plan 2b): navigate to '/records' from the caller.
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await deleteEntry(db, id);
}

export async function mergeCategoryAction(formData: FormData): Promise<void> {
  const input = parseMergeInput(formData);
  if (input === null) return;

  const db = await getBrowserDb();
  await renameCategory(db, input.from, input.to); // rename, or merge when `to` already exists
}

// Name (or rename) a trip. Called directly with args from the Trips rename dialog; an empty title clears
// the name. Keyed by the trip's stable id so the name survives later entries in the trip.
export async function renameTrip(currency: string, start: string, title: string): Promise<void> {
  const db = await getBrowserDb();
  await setTripTitle(db, tripId(currency, start), title);
}

// Create an empty category. Trimmed; blank is ignored. Duplicate names no-op in addCategory.
export async function addCategoryAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name.trim()) return;

  const db = await getBrowserDb();
  await addCategory(db, name.trim());
}

// Delete a category. deleteCategory guards emptiness, so a non-empty one is a no-op even if the UI somehow
// submits it — the button is only shown at count 0.
export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name) return;

  const db = await getBrowserDb();
  await deleteCategory(db, name);
}

// Restore the entire ledger from a Monefy-compatible CSV. Replace-all: parse, then restoreEntries wipes
// every existing entry and loads the file's rows. The caller (ImportBackup) reads the file + confirms first.
// Returns counts so the client can toast a summary. An empty/all-income file yields 0 entries (parseMonefyCsv
// does not throw); this refuses that — it throws before restoreEntries, so such a file can never silently
// clear the ledger.
export async function importBackupAction(
  csvText: string,
): Promise<{ imported: number; skipped: number }> {
  const { entries, skipped } = parseMonefyCsv(csvText);
  if (entries.length === 0) {
    throw new Error('Backup contained no importable entries');
  }
  const db = await getBrowserDb();
  await restoreEntries(db, entries);
  return { imported: entries.length, skipped };
}
