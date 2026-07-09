import { describe, expect, it } from 'vitest';
import { initDb } from '@db/client';
import { ensureCategoryMetaTable } from './schema';
import { getEmojiMap, setCategoryEmoji, emojiFor, FALLBACK_EMOJI } from './queries';

describe('category emoji queries', () => {
  it('sets and reads an emoji map', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryEmoji(db, 'Grab Food', '🍔');
    setCategoryEmoji(db, 'ค่าไฟ', '💡');
    expect(getEmojiMap(db)).toEqual({ 'Grab Food': '🍔', ค่าไฟ: '💡' });
  });

  it('upserts: re-assigning replaces the emoji', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryEmoji(db, 'Grab Food', '🍔');
    setCategoryEmoji(db, 'Grab Food', '🍜');
    expect(getEmojiMap(db)).toEqual({ 'Grab Food': '🍜' });
  });

  it('emojiFor falls back for an unassigned category', () => {
    const map = { 'Grab Food': '🍔' };
    expect(emojiFor(map, 'Grab Food')).toBe('🍔');
    expect(emojiFor(map, 'Unknown')).toBe(FALLBACK_EMOJI);
  });
});
