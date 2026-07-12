import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { categories } from './schema';

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
  const rows = db.select({ name: categories.name, emoji: categories.emoji }).from(categories).all();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.name] = row.emoji;
  return map;
}

// Upsert: assigning an emoji to a category replaces any prior one. Creates the category row if the
// name is new (a category with no entries yet is now legitimate).
export function setCategoryEmoji(db: Db, category: string, emoji: string): void {
  db.insert(categories)
    .values({ name: category, emoji })
    .onConflictDoUpdate({ target: categories.name, set: { emoji } })
    .run();
}

export function emojiFor(map: Record<string, string>, category: string): string {
  return map[category] ?? FALLBACK_EMOJI;
}

// Create an empty category (no entries yet) with the fallback emoji — it shows on the list immediately
// (getCategoryCounts left-joins, so count 0). No-op if the name already exists, so it never clobbers an
// existing category's emoji/hue. Restyle the icon/colour afterwards with the picker.
export function addCategory(db: Db, name: string): void {
  db.insert(categories)
    .values({ name, emoji: FALLBACK_EMOJI })
    .onConflictDoNothing({ target: categories.name })
    .run();
}

// Only categories with a picked hue land in the map; the rest fall through to the name-derived color.
export function getHueMap(db: Db): Record<string, number> {
  const rows = db.select({ name: categories.name, hue: categories.hue }).from(categories).all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.hue !== null) map[row.name] = row.hue;
  return map;
}

// Upsert the hue. `null` resets to auto. A new name gets the fallback emoji to satisfy NOT NULL; an
// existing row keeps its emoji (only hue changes).
export function setCategoryHue(db: Db, category: string, hue: number | null): void {
  db.insert(categories)
    .values({ name: category, emoji: FALLBACK_EMOJI, hue })
    .onConflictDoUpdate({ target: categories.name, set: { hue } })
    .run();
}

export function hueFor(map: Record<string, number>, category: string): number | undefined {
  return map[category];
}

// Resolve a category name to its id, creating the row (fallback emoji) if the name is new. This is the
// single write-boundary that turns the name-based UI/import into id-based storage. Idempotent.
export function categoryIdFor(db: Db, name: string): number {
  db.insert(categories)
    .values({ name, emoji: FALLBACK_EMOJI })
    .onConflictDoNothing({ target: categories.name })
    .run();
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .get();
  if (!row) throw new Error(`categoryIdFor: could not resolve category "${name}"`);
  return row.id;
}

// Only categories with a manual sort_order land in the map; unordered ones are absent (caller sorts
// them last). Mirrors getHueMap.
export function getCategoryOrderMap(db: Db): Record<string, number> {
  const rows = db
    .select({ name: categories.name, sortOrder: categories.sortOrder })
    .from(categories)
    .all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.sortOrder !== null) map[row.name] = row.sortOrder;
  return map;
}

// Persist a manual order: write a dense 0..n-1 to sort_order across the named categories, in one
// transaction. Names not present are no-ops (UPDATE ... WHERE name). Materialises the whole visible
// grid on every drop, so there is never a mix of ordered and half-ordered rows the user dragged.
export function setCategoryOrder(db: Db, orderedNames: string[]): void {
  db.transaction((tx) => {
    for (const [i, name] of orderedNames.entries()) {
      tx.update(categories).set({ sortOrder: i }).where(eq(categories.name, name)).run();
    }
  });
}
