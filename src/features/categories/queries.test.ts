import { describe, expect, it } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
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

async function db() {
  const d = makeNodeProxyDb();
  await ensureCategoriesTable(d);
  return d;
}

describe('categoryIdFor', () => {
  it('inserts a new category with the fallback emoji and returns its id', async () => {
    const d = await db();
    const id = await categoryIdFor(d, 'groceries');
    expect(id).toBeGreaterThan(0);
    expect(await getEmojiMap(d)).toEqual({ groceries: FALLBACK_EMOJI });
  });

  it('returns the existing id for a known name and does not duplicate or overwrite meta', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'groceries', '🛒');
    const first = await categoryIdFor(d, 'groceries');
    const second = await categoryIdFor(d, 'groceries');
    expect(second).toBe(first);
    expect(await getEmojiMap(d)).toEqual({ groceries: '🛒' }); // emoji preserved, not reset to fallback
  });
});

describe('addCategory', () => {
  it('creates a new empty category with the fallback emoji', async () => {
    const d = await db();
    await addCategory(d, 'Snacks');
    expect(await getEmojiMap(d)).toEqual({ Snacks: FALLBACK_EMOJI });
  });

  it('is a no-op on an existing name — keeps its emoji, no duplicate', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'Snacks', '🍿');
    await addCategory(d, 'Snacks');
    expect(await getEmojiMap(d)).toEqual({ Snacks: '🍿' });
  });
});

describe('emoji + hue maps read/write categories', () => {
  it('upserts an emoji and reads it back keyed by name', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'rent', '🏠');
    expect(emojiFor(await getEmojiMap(d), 'rent')).toBe('🏠');
    expect(emojiFor(await getEmojiMap(d), 'unknown')).toBe(FALLBACK_EMOJI);
  });

  it('sets and clears a hue (null = auto) without disturbing the emoji', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'rent', '🏠');
    await setCategoryHue(d, 'rent', 200);
    expect(hueFor(await getHueMap(d), 'rent')).toBe(200);
    await setCategoryHue(d, 'rent', null);
    expect(hueFor(await getHueMap(d), 'rent')).toBeUndefined();
    expect(emojiFor(await getEmojiMap(d), 'rent')).toBe('🏠'); // still there
  });

  it('keeps 0 (red) as a real pick, not "unset"', async () => {
    const d = await db();
    await setCategoryHue(d, 'Rent', 0);
    expect(await getHueMap(d)).toEqual({ Rent: 0 });
  });

  it('upserts: re-assigning replaces the emoji', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'Grab Food', '🍔');
    await setCategoryEmoji(d, 'Grab Food', '🍜');
    expect(await getEmojiMap(d)).toEqual({ 'Grab Food': '🍜' });
  });

  it('round-trips a non-ASCII (Thai) category name', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'ค่าไฟ', '💡');
    expect(await getEmojiMap(d)).toEqual({ ค่าไฟ: '💡' });
  });
});

describe('setCategoryOrder / getCategoryOrderMap', () => {
  it('writes a dense sort_order in the given order and reads it back', async () => {
    const d = await db();
    await addCategory(d, 'Food');
    await addCategory(d, 'Coffee');
    await addCategory(d, 'Games');
    await setCategoryOrder(d, ['Coffee', 'Games', 'Food']);
    expect(await getCategoryOrderMap(d)).toEqual({ Coffee: 0, Games: 1, Food: 2 });
  });

  it('leaves an untouched category out of the map (null sort_order)', async () => {
    const d = await db();
    await addCategory(d, 'Food');
    await addCategory(d, 'Coffee');
    await setCategoryOrder(d, ['Coffee']); // Food never ordered
    const map = await getCategoryOrderMap(d);
    expect(map).toEqual({ Coffee: 0 });
    expect('Food' in map).toBe(false);
  });

  it('re-orders densely on a subsequent call', async () => {
    const d = await db();
    await addCategory(d, 'Food');
    await addCategory(d, 'Coffee');
    await setCategoryOrder(d, ['Food', 'Coffee']);
    await setCategoryOrder(d, ['Coffee', 'Food']);
    expect(await getCategoryOrderMap(d)).toEqual({ Coffee: 0, Food: 1 });
  });
});
