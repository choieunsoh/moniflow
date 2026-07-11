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
});
