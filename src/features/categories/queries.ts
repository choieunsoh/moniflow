import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import type { CategoryCatalogRow } from '@features/settings/catalog';
import { categories } from './schema';
import { defaultEmojiFor, FALLBACK_EMOJI } from './default-emoji';

// Re-exported so existing importers keep one import site for the neutral tag; it and the name-based
// seeding live together in default-emoji.ts, which stays DB-free and testable on its own.
export { FALLBACK_EMOJI } from './default-emoji';

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
  '📦',
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
  '📦': 'Delivery',
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

export async function getEmojiMap(db: Db): Promise<Record<string, string>> {
  const rows = await db
    .select({ name: categories.name, emoji: categories.emoji })
    .from(categories)
    .all();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.name] = row.emoji;
  return map;
}

// Upsert: assigning an emoji to a category replaces any prior one. Creates the category row if the
// name is new (a category with no entries yet is now legitimate).
export async function setCategoryEmoji(db: Db, category: string, emoji: string): Promise<void> {
  await db
    .insert(categories)
    .values({ name: category, emoji })
    .onConflictDoUpdate({ target: categories.name, set: { emoji } })
    .run();
}

export function emojiFor(map: Record<string, string>, category: string): string {
  return map[category] ?? FALLBACK_EMOJI;
}

// Create an empty category (no entries yet), seeding its icon from the name — it shows on the list
// immediately (getCategoryCounts left-joins, so count 0). No-op if the name already exists, so it
// never clobbers an existing category's emoji/hue. Restyle the icon/colour afterwards with the picker.
export async function addCategory(db: Db, name: string): Promise<void> {
  await db
    .insert(categories)
    .values({ name, emoji: defaultEmojiFor(name) })
    .onConflictDoNothing({ target: categories.name })
    .run();
}

// Only categories with a picked hue land in the map; the rest fall through to the name-derived color.
export async function getHueMap(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ name: categories.name, hue: categories.hue })
    .from(categories)
    .all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.hue !== null) map[row.name] = row.hue;
  return map;
}

// Upsert the hue. `null` resets to auto. A new name gets its name-seeded emoji to satisfy NOT NULL;
// an existing row keeps its emoji (only hue changes).
export async function setCategoryHue(db: Db, category: string, hue: number | null): Promise<void> {
  await db
    .insert(categories)
    .values({ name: category, emoji: defaultEmojiFor(category), hue })
    .onConflictDoUpdate({ target: categories.name, set: { hue } })
    .run();
}

export function hueFor(map: Record<string, number>, category: string): number | undefined {
  return map[category];
}

// The set of category NAMES flagged off-budget — loaded like getEmojiMap/getHueMap and used by
// off-budget.ts to decide which spend the budget meters ignore.
export async function getOffBudgetCategories(db: Db): Promise<Set<string>> {
  const rows = await db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.offBudget, 1))
    .all();
  return new Set(rows.map((r) => r.name));
}

// Toggle a category's off-budget default. Mirrors setCategoryHue's update-by-name shape.
export async function setCategoryOffBudget(
  db: Db,
  category: string,
  offBudget: boolean,
): Promise<void> {
  await db
    .update(categories)
    .set({ offBudget: offBudget ? 1 : 0 })
    .where(eq(categories.name, category))
    .run();
}

// Resolve a category name to its id, creating the row if the name is new. This is the single
// write-boundary that turns the name-based UI/import into id-based storage, so seeding the icon HERE
// is what makes a Monefy CSV restore arrive with meaningful icons rather than 22 identical tags —
// every import and keypad entry routes through it. Idempotent.
export async function categoryIdFor(db: Db, name: string): Promise<number> {
  await db
    .insert(categories)
    .values({ name, emoji: defaultEmojiFor(name) })
    .onConflictDoNothing({ target: categories.name })
    .run();
  const row = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, name))
    .get();
  if (!row) throw new Error(`categoryIdFor: could not resolve category "${name}"`);
  return row.id;
}

// Only categories with a manual sort_order land in the map; unordered ones are absent (caller sorts
// them last). Mirrors getHueMap.
export async function getCategoryOrderMap(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ name: categories.name, sortOrder: categories.sortOrder })
    .from(categories)
    .all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.sortOrder !== null) map[row.name] = row.sortOrder;
  return map;
}

// Persist a manual order: write a dense 0..n-1 to sort_order across the named categories, in one
// batch. Names not present are no-ops (UPDATE ... WHERE name). Materialises the whole visible
// grid on every drop, so there is never a mix of ordered and half-ordered rows the user dragged.
export async function setCategoryOrder(db: Db, orderedNames: string[]): Promise<void> {
  if (orderedNames.length === 0) return;
  const mk = (name: string, i: number) =>
    db.update(categories).set({ sortOrder: i }).where(eq(categories.name, name));
  const [first, ...rest] = orderedNames;
  await db.batch([mk(first, 0), ...rest.map((name, i) => mk(name, i + 1))]);
}

export async function getCategoryCatalog(db: Db): Promise<CategoryCatalogRow[]> {
  const rows = await db
    .select({
      name: categories.name,
      emoji: categories.emoji,
      hue: categories.hue,
      sortOrder: categories.sortOrder,
      archived: categories.archived,
      offBudget: categories.offBudget,
    })
    .from(categories)
    .orderBy(categories.name)
    .all();
  return rows.map((r) => ({
    ...r,
    archived: Boolean(r.archived),
    offBudget: Boolean(r.offBudget),
  }));
}

// Upsert each row by name — updates the metadata of an existing category, inserts a missing one.
// NEVER deletes: unlisted categories may be referenced by entries. One batch.
export async function restoreCategoryCatalog(db: Db, rows: CategoryCatalogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const mk = (r: CategoryCatalogRow) => {
    const archived = r.archived ? 1 : 0; // column is a raw integer flag (schema: integer, notNull default 0)
    // A backup predating the off-budget field carries no opinion on it, so omit the column entirely
    // rather than writing 0 — that leaves an existing category's flag alone (and a new one on the
    // schema default) instead of silently clearing what the user set on this device.
    const offBudget = r.offBudget === undefined ? {} : { offBudget: r.offBudget ? 1 : 0 };
    return db
      .insert(categories)
      .values({
        name: r.name,
        emoji: r.emoji,
        hue: r.hue,
        sortOrder: r.sortOrder,
        archived,
        ...offBudget,
      })
      .onConflictDoUpdate({
        target: categories.name,
        set: { emoji: r.emoji, hue: r.hue, sortOrder: r.sortOrder, archived, ...offBudget },
      });
  };
  const [first, ...rest] = rows;
  await db.batch([mk(first), ...rest.map(mk)]);
}
