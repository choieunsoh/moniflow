'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { parseEntryForm } from './entry-form';
import { insertEntry, updateEntry, deleteEntry, renameCategory, deleteCategory } from './queries';
import { parseMergeInput } from './merge-input';
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
