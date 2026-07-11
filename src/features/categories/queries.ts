import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { categoryMeta } from './schema';

// Shown for any category without an assigned emoji.
export const FALLBACK_EMOJI = '🏷️';

// Curated picker set — common expense categories, calm and non-exhaustive. Food/drink, shopping,
// bills/home, transport, health, leisure, money, misc.
export const EMOJI_CHOICES = [
  '🍔',
  '🍜',
  '🍲',
  '🍱',
  '🍕',
  '🍞',
  '🍦',
  '🍪',
  '🍭',
  '🍿',
  '🍰',
  '☕',
  '🥤',
  '🍵',
  '🍺',
  '🍻',
  '🥂',
  '🍷',
  '🍸',
  '🥃',
  '🍾',
  '🛒',
  '🧺',
  '🛍️',
  '👜',
  '👕',
  '👟',
  '👗',
  '💍',
  '🎁',
  '🏠',
  '🏨',
  '🧾',
  '💡',
  '📱',
  '💻',
  '🖥️',
  '📁',
  '📶',
  '🚕',
  '⛽',
  '✈️',
  '🏝️',
  '🚌',
  '🚆',
  '🚈',
  '🚊',
  '🛵',
  '🏍️',
  '🧳',
  '🏥',
  '💊',
  '🎮',
  '🎬',
  '🎵',
  '📚',
  '🐶',
  '🏋️',
  '💇',
  '🧹',
  '💰',
  '💳',
  '🏦',
  '💲',
  '💴',
  '🇰🇷',
  '📈',
  '🎓',
  '🧸',
  '🚰',
  '🔧',
  '🏷️',
] as const;

// Human names for the picker tooltips / aria-labels — one per EMOJI_CHOICES entry. A bare-emoji
// tooltip is useless (you're already looking at it), so hovering a choice names it instead.
// Kept in sync with EMOJI_CHOICES by emoji-labels.test.ts.
export const EMOJI_LABELS: Record<string, string> = {
  '🍔': 'Burger',
  '🍜': 'Noodles',
  '🍲': 'Soup',
  '🍱': 'Bento',
  '☕': 'Coffee',
  '🍺': 'Drinks',
  '🍰': 'Dessert',
  '🛒': 'Groceries',
  '🛍️': 'Shopping',
  '👕': 'Clothes',
  '👟': 'Shoes',
  '💍': 'Jewelry',
  '🎁': 'Gifts',
  '🏠': 'Home',
  '🏨': 'Hotel',
  '🧾': 'Bills',
  '💡': 'Utilities',
  '📱': 'Phone',
  '💻': 'Computer',
  '📶': 'Internet',
  '🚕': 'Taxi',
  '⛽': 'Fuel',
  '✈️': 'Travel',
  '🚌': 'Bus',
  '🚆': 'Train',
  '🛵': 'Delivery',
  '🏥': 'Hospital',
  '💊': 'Medicine',
  '🎮': 'Games',
  '🎬': 'Movies',
  '🎵': 'Music',
  '📚': 'Books',
  '🐶': 'Pets',
  '🏋️': 'Gym',
  '💇': 'Haircut',
  '🧹': 'Cleaning',
  '💰': 'Cash',
  '💳': 'Card',
  '🏦': 'Bank',
  '📈': 'Investing',
  '🎓': 'Education',
  '🧸': 'Toys',
  '🚰': 'Water',
  '🔧': 'Repairs',
  '🧺': 'Basket',
  '👜': 'Bag',
  '👗': 'Dress',
  '🍻': 'Beers',
  '🥂': 'Cheers',
  '🖥️': 'Desktop',
  '📁': 'Folder',
  '🏝️': 'Island',
  '💲': 'Dollar',
  '💴': 'Yen',
  '🇰🇷': 'Won',
  '🏷️': 'Tag',
  '🍷': 'Wine',
  '🍸': 'Martini',
  '🥃': 'Brandy',
  '🍾': 'Champagne',
  '🍵': 'Tea',
  '🥤': 'Drink',
  '🍕': 'Pizza',
  '🍦': 'Ice cream',
  '🍪': 'Cookie',
  '🍞': 'Bread',
  '🍭': 'Popsicle',
  '🍿': 'Popcorn',
  '🏍️': 'Motorbike',
  '🚈': 'Light rail',
  '🚊': 'Tram',
  '🧳': 'Luggage',
};

export function getEmojiMap(db: Db): Record<string, string> {
  const rows = db.select().from(categoryMeta).all();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.category] = row.emoji;
  return map;
}

// Upsert: assigning an emoji to a category replaces any prior one.
export function setCategoryEmoji(db: Db, category: string, emoji: string): void {
  db.insert(categoryMeta)
    .values({ category, emoji })
    .onConflictDoUpdate({ target: categoryMeta.category, set: { emoji } })
    .run();
}

export function emojiFor(map: Record<string, string>, category: string): string {
  return map[category] ?? FALLBACK_EMOJI;
}

// Only categories with a picked hue land in the map; the rest fall through to the name-derived color.
export function getHueMap(db: Db): Record<string, number> {
  const rows = db
    .select({ category: categoryMeta.category, hue: categoryMeta.hue })
    .from(categoryMeta)
    .all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.hue !== null) map[row.category] = row.hue;
  return map;
}

// Upsert the hue. `null` resets to auto. A category with no meta row yet gets the fallback emoji so
// the NOT NULL emoji column is satisfied; an existing row keeps its emoji (only hue is updated).
export function setCategoryHue(db: Db, category: string, hue: number | null): void {
  db.insert(categoryMeta)
    .values({ category, emoji: FALLBACK_EMOJI, hue })
    .onConflictDoUpdate({ target: categoryMeta.category, set: { hue } })
    .run();
}

export function hueFor(map: Record<string, number>, category: string): number | undefined {
  return map[category];
}

// Follow a category rename/merge with its display meta, mirroring entries' renameCategory: on a pure
// rename, carry the emoji + hue to the new name; on a merge (the target already has meta), the target
// wins — keep its meta and drop the now-orphaned source row (avoids a PK collision on the move).
export function renameCategoryMeta(db: Db, from: string, to: string): void {
  if (from === to) return;
  const source = db.select().from(categoryMeta).where(eq(categoryMeta.category, from)).all();
  if (source.length === 0) return;
  const target = db.select().from(categoryMeta).where(eq(categoryMeta.category, to)).all();
  if (target.length === 0) {
    db.update(categoryMeta).set({ category: to }).where(eq(categoryMeta.category, from)).run();
  } else {
    db.delete(categoryMeta).where(eq(categoryMeta.category, from)).run();
  }
}
