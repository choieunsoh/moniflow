'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { parseEntryForm } from './entry-form';
import { insertEntry, updateEntry, deleteEntry, renameCategory } from './queries';
import { parseMergeInput } from './merge-input';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { renameCategoryMeta } from '@features/categories/queries';

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
  ensureCategoryMetaTable(db);
  renameCategory(db, input.from, input.to);
  // Move the category's emoji + hue along with it, else the rename shows the fallback icon/color.
  renameCategoryMeta(db, input.from, input.to);
  revalidatePath('/', 'layout');
}
