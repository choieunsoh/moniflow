'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureCategoriesTable } from './schema';
import { setCategoryEmoji, setCategoryHue } from './queries';

// Assign an emoji to a category (upsert). Revalidates the whole app so the emoji shows on records,
// the donut legend, and the category list at once.
export async function setCategoryEmojiAction(formData: FormData): Promise<void> {
  const category = formData.get('category');
  const emoji = formData.get('emoji');
  if (typeof category !== 'string' || typeof emoji !== 'string' || !category || !emoji) return;

  const db = initDb();
  ensureCategoriesTable(db);
  setCategoryEmoji(db, category, emoji);
  revalidatePath('/', 'layout');
}

// Set (or reset, via "auto") a category's disc hue. Revalidates the whole app so the color updates on
// records, the keypad, and the breakdown at once.
export async function setCategoryHueAction(formData: FormData): Promise<void> {
  const category = formData.get('category');
  const hueRaw = formData.get('hue');
  if (typeof category !== 'string' || !category || typeof hueRaw !== 'string') return;

  const hue = hueRaw === 'auto' ? null : Number(hueRaw);
  if (hue !== null && (!Number.isInteger(hue) || hue < 0 || hue > 359)) return;

  const db = initDb();
  ensureCategoriesTable(db);
  setCategoryHue(db, category, hue);
  revalidatePath('/', 'layout');
}
