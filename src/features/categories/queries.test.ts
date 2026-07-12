import { describe, expect, it } from 'vitest';
import { initDb } from '@db/client';
import { ensureCategoriesTable } from './schema';
import {
  getEmojiMap,
  setCategoryEmoji,
  emojiFor,
  FALLBACK_EMOJI,
  getHueMap,
  setCategoryHue,
  hueFor,
  categoryIdFor,
  addCategory,
  getCategoryOrderMap,
  setCategoryOrder,
} from './queries';

function db() {
  const d = initDb(':memory:');
  ensureCategoriesTable(d);
  return d;
}

describe('categoryIdFor', () => {
  it('inserts a new category with the fallback emoji and returns its id', () => {
    const d = db();
    const id = categoryIdFor(d, 'groceries');
    expect(id).toBeGreaterThan(0);
    expect(getEmojiMap(d)).toEqual({ groceries: FALLBACK_EMOJI });
  });

  it('returns the existing id for a known name and does not duplicate or overwrite meta', () => {
    const d = db();
    setCategoryEmoji(d, 'groceries', '🛒');
    const first = categoryIdFor(d, 'groceries');
    const second = categoryIdFor(d, 'groceries');
    expect(second).toBe(first);
    expect(getEmojiMap(d)).toEqual({ groceries: '🛒' }); // emoji preserved, not reset to fallback
  });
});

describe('addCategory', () => {
  it('creates a new empty category with the fallback emoji', () => {
    const d = db();
    addCategory(d, 'Snacks');
    expect(getEmojiMap(d)).toEqual({ Snacks: FALLBACK_EMOJI });
  });

  it('is a no-op on an existing name — keeps its emoji, no duplicate', () => {
    const d = db();
    setCategoryEmoji(d, 'Snacks', '🍿');
    addCategory(d, 'Snacks');
    expect(getEmojiMap(d)).toEqual({ Snacks: '🍿' });
  });
});

describe('emoji + hue maps read/write categories', () => {
  it('upserts an emoji and reads it back keyed by name', () => {
    const d = db();
    setCategoryEmoji(d, 'rent', '🏠');
    expect(emojiFor(getEmojiMap(d), 'rent')).toBe('🏠');
    expect(emojiFor(getEmojiMap(d), 'unknown')).toBe(FALLBACK_EMOJI);
  });

  it('sets and clears a hue (null = auto) without disturbing the emoji', () => {
    const d = db();
    setCategoryEmoji(d, 'rent', '🏠');
    setCategoryHue(d, 'rent', 200);
    expect(hueFor(getHueMap(d), 'rent')).toBe(200);
    setCategoryHue(d, 'rent', null);
    expect(hueFor(getHueMap(d), 'rent')).toBeUndefined();
    expect(emojiFor(getEmojiMap(d), 'rent')).toBe('🏠'); // still there
  });

  it('keeps 0 (red) as a real pick, not "unset"', () => {
    const d = db();
    setCategoryHue(d, 'Rent', 0);
    expect(getHueMap(d)).toEqual({ Rent: 0 });
  });

  it('upserts: re-assigning replaces the emoji', () => {
    const d = db();
    setCategoryEmoji(d, 'Grab Food', '🍔');
    setCategoryEmoji(d, 'Grab Food', '🍜');
    expect(getEmojiMap(d)).toEqual({ 'Grab Food': '🍜' });
  });

  it('round-trips a non-ASCII (Thai) category name', () => {
    const d = db();
    setCategoryEmoji(d, 'ค่าไฟ', '💡');
    expect(getEmojiMap(d)).toEqual({ ค่าไฟ: '💡' });
  });
});

describe('setCategoryOrder / getCategoryOrderMap', () => {
  it('writes a dense sort_order in the given order and reads it back', () => {
    const d = db();
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    addCategory(d, 'Games');
    setCategoryOrder(d, ['Coffee', 'Games', 'Food']);
    expect(getCategoryOrderMap(d)).toEqual({ Coffee: 0, Games: 1, Food: 2 });
  });

  it('leaves an untouched category out of the map (null sort_order)', () => {
    const d = db();
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    setCategoryOrder(d, ['Coffee']); // Food never ordered
    const map = getCategoryOrderMap(d);
    expect(map).toEqual({ Coffee: 0 });
    expect('Food' in map).toBe(false);
  });

  it('re-orders densely on a subsequent call', () => {
    const d = db();
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    setCategoryOrder(d, ['Food', 'Coffee']);
    setCategoryOrder(d, ['Coffee', 'Food']);
    expect(getCategoryOrderMap(d)).toEqual({ Coffee: 0, Food: 1 });
  });
});
