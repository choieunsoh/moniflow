'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { parseEntryForm } from './entry-form';
import { insertEntry, updateEntry, deleteEntry, renameCategory } from './queries';
import { parseMergeInput } from './merge-input';

// The only feature module allowed to import Next's mutation APIs. Each action: open the DB,
// parse + validate the form, write, invalidate the dashboard's cache, and (for add/edit)
// navigate back to it. A failed parse throws — Next surfaces it via the nearest error boundary;
// a friendlier inline message is deferred (single-user local app, low stakes).
export async function addEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const result = parseEntryForm(formData);
  if (!result.ok) {
    throw new Error(result.error);
  }
  insertEntry(db, result.entry);
  revalidatePath('/dashboard');
  redirect('/dashboard');
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
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  const id = Number(formData.get('id'));
  deleteEntry(db, id);
  revalidatePath('/dashboard');
}

export async function mergeCategoryAction(formData: FormData): Promise<void> {
  const input = parseMergeInput(formData);
  if (input === null) return;

  const db = initDb();
  ensureEntriesTable(db);
  renameCategory(db, input.from, input.to);
  revalidatePath('/categories');
  revalidatePath('/dashboard');
}
