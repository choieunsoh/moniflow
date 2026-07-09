import type { Db } from '@db/client';
import { categoryMeta } from './schema';

// Shown for any category without an assigned emoji.
export const FALLBACK_EMOJI = '🏷️';

// Curated picker set — common expense categories, calm and non-exhaustive. Food/drink, shopping,
// bills/home, transport, health, leisure, money, misc.
export const EMOJI_CHOICES = [
  '🍔',
  '🍜',
  '🍱',
  '☕',
  '🍺',
  '🍰',
  '🛒',
  '🛍️',
  '👕',
  '👟',
  '💄',
  '💍',
  '🎁',
  '🏠',
  '🏨',
  '🧾',
  '💡',
  '📱',
  '💻',
  '📶',
  '🚕',
  '⛽',
  '✈️',
  '🚌',
  '🚆',
  '🛵',
  '🏥',
  '💊',
  '💅',
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
  '📈',
  '🎓',
  '🧸',
  '🚰',
  '🔧',
] as const;

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
