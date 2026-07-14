import { getBrowserDb } from '@db/browser';
import { setCategoryEmoji, setCategoryHue, setCategoryOrder } from './queries';
import { isValidDiscHue } from './color';
import { bumpDataVersion } from '@shared/data-version';

// Client-side category writes against the browser OPFS db (offline-first — no 'use server'/revalidatePath;
// the worker bootstraps tables, so no ensure* needed). React 19 form actions accept these client functions
// directly, so call sites are unchanged. Each write bumps the shared data-version store so live read-hooks
// (Plan 2b) refetch.
export async function setCategoryEmojiAction(formData: FormData): Promise<void> {
  const category = formData.get('category');
  const emoji = formData.get('emoji');
  if (typeof category !== 'string' || typeof emoji !== 'string' || !category || !emoji) return;
  const db = await getBrowserDb();
  await setCategoryEmoji(db, category, emoji);
  bumpDataVersion();
}

export async function setCategoryHueAction(formData: FormData): Promise<void> {
  const category = formData.get('category');
  const hueRaw = formData.get('hue');
  if (typeof category !== 'string' || !category || typeof hueRaw !== 'string') return;

  const hue = hueRaw === 'auto' ? null : Number(hueRaw);
  if (hue !== null && !isValidDiscHue(hue)) return;

  const db = await getBrowserDb();
  await setCategoryHue(db, category, hue);
  bumpDataVersion();
}

// Persist the keypad's manual category order. Typed args (not FormData) — the client posts the new order
// as a string[].
export async function reorderCategories(orderedNames: string[]): Promise<void> {
  const db = await getBrowserDb();
  await setCategoryOrder(db, orderedNames);
  bumpDataVersion();
}
