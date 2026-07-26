import { getBrowserDb } from '@db/browser';
import {
  addCategory,
  setCategoryEmoji,
  setCategoryHue,
  setCategoryOffBudget,
  setCategoryOrder,
} from './queries';
import { addAccount } from '@features/accounts/queries';
import { STARTER_CATEGORIES, STARTER_ACCOUNTS } from './starter';
import { isValidDiscHue } from './color';
import { bumpDataVersion } from '@shared/data-version';

// Fill an empty ledger with the starter set (see starter.ts) — the way out of a first run where the
// keypad can only pick from categories and accounts that do not exist yet.
//
// Idempotent for free: addCategory and addAccount both no-op on a duplicate name and both columns are
// UNIQUE, so a double tap adds nothing twice. That is why this can stay a plain "add these" rather
// than a guarded "seed only if empty" — the caller offers it when the picker is empty, but nothing
// breaks if it runs again.
//
// It seeds BOTH tables from the category screen on purpose: every expense needs an account too, so
// splitting it would only mean two prompts on the same first run. Called explicitly from a tap,
// never on boot — a silent seed would collide with a Monefy CSV restore and leave a dozen unused
// categories behind for the user to delete by hand.
export async function seedStarterSetAction(): Promise<void> {
  const db = await getBrowserDb();
  for (const name of STARTER_CATEGORIES) await addCategory(db, name);
  for (const name of STARTER_ACCOUNTS) await addAccount(db, name);
  bumpDataVersion();
}

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

// Toggle a category's off-budget default. Typed args (not FormData) — a checkbox has no natural
// submit-button value the way the emoji/hue swatches do, so this posts the boolean directly, same
// shape as reorderCategories.
export async function setCategoryOffBudgetAction(
  category: string,
  offBudget: boolean,
): Promise<void> {
  const db = await getBrowserDb();
  await setCategoryOffBudget(db, category, offBudget);
  bumpDataVersion();
}
