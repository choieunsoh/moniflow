'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable, ensureTripTitlesTable } from './schema';
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
import { ensureCategoriesTable } from '@features/categories/schema';
import { addCategory } from '@features/categories/queries';

// The only feature module allowed to import Next's mutation APIs. Each action: open the DB,
// parse + validate the form, write, revalidate the whole app (`revalidatePath('/', 'layout')` — one
// call refreshes every page under the root layout), and (for add/edit) navigate onward. A failed
// parse throws — Next surfaces it via the nearest error boundary; a friendlier inline message is
// deferred (single-user local app, low stakes).
export async function addEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const result = parseEntryForm(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  insertEntry(db, result.entry);
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function editEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const id = Number(formData.get('id'));
  const result = parseEntryForm(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  updateEntry(db, id, result.entry);
  revalidatePath('/', 'layout');
  redirect('/records');
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const id = Number(formData.get('id'));
  deleteEntry(db, id);
  revalidatePath('/', 'layout');
}

export async function mergeCategoryAction(formData: FormData): Promise<void> {
  const input = parseMergeInput(formData);
  if (input === null) return;

  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  renameCategory(db, input.from, input.to); // rename, or merge when `to` already exists
  revalidatePath('/', 'layout');
}

// Name (or rename) a trip. Called directly with args from the Trips rename dialog; an empty title
// clears the name. Keyed by the trip's stable id so the name survives later entries in the trip.
export async function renameTrip(currency: string, start: string, title: string): Promise<void> {
  const db = initDb();
  ensureTripTitlesTable(db);
  setTripTitle(db, tripId(currency, start), title);
  revalidatePath('/', 'layout');
}

// Create an empty category. Trimmed; blank is ignored. Duplicate names no-op in addCategory.
export async function addCategoryAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name.trim()) return;

  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  addCategory(db, name.trim());
  revalidatePath('/', 'layout');
}

// Delete a category. deleteCategory guards emptiness, so a non-empty one is a no-op even if the UI
// somehow submits it — the button is only shown at count 0.
export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name) return;

  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  deleteCategory(db, name);
  revalidatePath('/', 'layout');
}

// Restore the entire ledger from a Monefy-compatible CSV (a moniflow export, or a real Monefy export).
// Replace-all: parse, then restoreEntries wipes every existing entry and loads the file's rows. The
// caller (ImportBackup) reads the file in the browser and confirms first. Returns counts so the client
// can toast a summary; a malformed/empty file makes parseMonefyCsv yield 0 entries — that still runs a
// (harmless) clear, so the client guards against an empty parse before calling (see Task 5).
export async function importBackupAction(
  csvText: string,
): Promise<{ imported: number; skipped: number }> {
  const db = initDb();
  ensureEntriesTable(db);
  const { entries, skipped } = parseMonefyCsv(csvText);
  restoreEntries(db, entries);
  revalidatePath('/', 'layout');
  return { imported: entries.length, skipped };
}
