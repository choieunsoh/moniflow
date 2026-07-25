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
  getCategoryCatalog,
  restoreCategoryCatalog,
  getOffBudgetCategories,
  setCategoryOffBudget,
} from './queries';

async function db() {
  const d = makeNodeProxyDb();
  await ensureCategoriesTable(d);
  return d;
}

describe('categoryIdFor', () => {
  // This is the write-boundary every import and keypad entry routes through, so the seeding has to
  // happen here or a Monefy restore lands 22 categories all wearing the same neutral tag.
  it('inserts a new category with an icon seeded from the name, and returns its id', async () => {
    const d = await db();
    const id = await categoryIdFor(d, 'groceries');
    expect(id).toBeGreaterThan(0);
    expect(await getEmojiMap(d)).toEqual({ groceries: '🛒' });
  });

  it('still falls back to the neutral tag for a name it cannot read', async () => {
    const d = await db();
    await categoryIdFor(d, 'Qwertyuiop');
    expect(await getEmojiMap(d)).toEqual({ Qwertyuiop: FALLBACK_EMOJI });
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
  it('creates a new empty category with an icon seeded from the name', async () => {
    const d = await db();
    await addCategory(d, 'Snacks');
    expect(await getEmojiMap(d)).toEqual({ Snacks: '🍰' });
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

describe('category catalog read/restore', () => {
  it('reads back rows and upserts by name without deleting unlisted', async () => {
    const d = await db();
    await addCategory(d, 'Keep'); // pre-existing, NOT in the restore payload
    await restoreCategoryCatalog(d, [
      { name: 'Food', emoji: '🍔', hue: 12, sortOrder: 0, archived: false },
    ]);
    await restoreCategoryCatalog(d, [
      { name: 'Food', emoji: '🍜', hue: null, sortOrder: 3, archived: true }, // updates existing
    ]);
    const rows = await getCategoryCatalog(d);
    const names = rows.map((r) => r.name);
    expect(names).toContain('Keep'); // never deleted
    const food = rows.find((r) => r.name === 'Food');
    expect(food).toEqual({ name: 'Food', emoji: '🍜', hue: null, sortOrder: 3, archived: true });
  });
});

describe('off-budget categories', () => {
  it('returns a Set of category names flagged as off-budget', async () => {
    const d = await db();
    await addCategory(d, 'Insurance');
    await addCategory(d, 'Groceries');
    await setCategoryOffBudget(d, 'Insurance', true);
    const offBudget = await getOffBudgetCategories(d);
    expect(offBudget).toBeInstanceOf(Set);
    expect(offBudget).toContain('Insurance');
    expect(offBudget).not.toContain('Groceries');
  });

  it('removes a category from off-budget when set to false', async () => {
    const d = await db();
    await addCategory(d, 'Insurance');
    await setCategoryOffBudget(d, 'Insurance', true);
    expect(await getOffBudgetCategories(d)).toContain('Insurance');
    await setCategoryOffBudget(d, 'Insurance', false);
    expect(await getOffBudgetCategories(d)).not.toContain('Insurance');
  });
});
