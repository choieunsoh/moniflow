'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setCutoff, isValidCutoffDay, setIconSet, isIconSet } from './queries';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { wipeAllData } from './data';

// Server Action backing the /settings form. Validates before writing (the <input min/max> only
// constrains well-behaved browsers — this is the real guard), then revalidates both pages that
// read the cutoff so a fresh visit reflects the change immediately.
export async function setCutoffAction(formData: FormData): Promise<void> {
  const raw = formData.get('day');
  const day = Number(raw);
  if (!isValidCutoffDay(day)) {
    const shown = typeof raw === 'string' ? raw : 'a file';
    throw new Error(`Cutoff day must be an integer between 1 and 28, got: ${shown}`);
  }
  const db = initDb();
  ensureSettingsTable(db);
  setCutoff(db, day);
  revalidatePath('/', 'layout');
}

// Server Action backing the icon-set picker. Validates the value is a known set, then revalidates
// the whole app so every category marker re-renders in the chosen style at once.
export async function setIconSetAction(formData: FormData): Promise<void> {
  const value = formData.get('iconSet');
  if (!isIconSet(value)) {
    throw new Error(`Unknown icon set: ${typeof value === 'string' ? value : 'a file'}`);
  }
  const db = initDb();
  ensureSettingsTable(db);
  setIconSet(db, value);
  revalidatePath('/', 'layout');
}

// Irreversible: clear every entry, category, and budget, then revalidate the whole app so all
// surfaces re-render empty. Confirm-gated in the UI (WipeAllData + ConfirmDialog).
export async function wipeAllDataAction(): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  wipeAllData(db);
  revalidatePath('/', 'layout');
}
