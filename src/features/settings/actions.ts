'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setCutoff, isValidCutoffDay } from './queries';

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
  revalidatePath('/dashboard');
  revalidatePath('/settings');
}
