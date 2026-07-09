'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureCategoryMetaTable } from './schema';
import { setCategoryEmoji } from './queries';

// Assign an emoji to a category (upsert). Revalidates the whole app so the emoji shows on records,
// the donut legend, and the category list at once.
export async function setCategoryEmojiAction(formData: FormData): Promise<void> {
  const category = formData.get('category');
  const emoji = formData.get('emoji');
  if (typeof category !== 'string' || typeof emoji !== 'string' || !category || !emoji) return;

  const db = initDb();
  ensureCategoryMetaTable(db);
  setCategoryEmoji(db, category, emoji);
  revalidatePath('/', 'layout');
}
