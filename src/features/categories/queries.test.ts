import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
import { ensureCategoryMetaTable } from './schema';
import {
  getEmojiMap,
  setCategoryEmoji,
  emojiFor,
  FALLBACK_EMOJI,
  getHueMap,
  setCategoryHue,
  hueFor,
  renameCategoryMeta,
} from './queries';

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

describe('category hue queries', () => {
  it('sets a hue for a category with no prior meta row', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryHue(db, 'Coffee', 25);
    expect(getHueMap(db)).toEqual({ Coffee: 25 });
    // the fallback emoji backfills so the NOT NULL column holds
    expect(getEmojiMap(db)).toEqual({ Coffee: FALLBACK_EMOJI });
  });

  it('keeps 0 (red) as a real pick, not "unset"', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryHue(db, 'Rent', 0);
    expect(getHueMap(db)).toEqual({ Rent: 0 });
  });

  it('updating a hue leaves the emoji intact', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryEmoji(db, 'Coffee', '☕');
    setCategoryHue(db, 'Coffee', 130);
    expect(getEmojiMap(db)).toEqual({ Coffee: '☕' });
    expect(getHueMap(db)).toEqual({ Coffee: 130 });
  });

  it('null resets to auto (drops out of the hue map)', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryHue(db, 'Coffee', 130);
    setCategoryHue(db, 'Coffee', null);
    expect(getHueMap(db)).toEqual({});
  });

  it('hueFor returns the pick or undefined', () => {
    expect(hueFor({ Coffee: 25 }, 'Coffee')).toBe(25);
    expect(hueFor({ Coffee: 25 }, 'Rent')).toBeUndefined();
  });

  it('migrates a pre-hue table by adding the column, keeping existing rows', () => {
    const db = initDb(':memory:');
    // Simulate an existing DB from before `hue`: the old two-column table with a row already in it.
    db.run(sql`CREATE TABLE category_meta (category TEXT PRIMARY KEY, emoji TEXT NOT NULL)`);
    db.run(sql`INSERT INTO category_meta (category, emoji) VALUES ('Coffee', '☕')`);

    // The app always runs this first after initDb — here it must ALTER in the missing column.
    ensureCategoryMetaTable(db);

    expect(getEmojiMap(db)).toEqual({ Coffee: '☕' }); // data survived the migration
    setCategoryHue(db, 'Coffee', 45);
    expect(getHueMap(db)).toEqual({ Coffee: 45 });
  });
});

describe('renameCategoryMeta', () => {
  it('carries the emoji + hue to the new name on a pure rename', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryEmoji(db, 'Coffee', '☕');
    setCategoryHue(db, 'Coffee', 25);

    renameCategoryMeta(db, 'Coffee', 'Cafe');

    expect(getEmojiMap(db)).toEqual({ Cafe: '☕' });
    expect(getHueMap(db)).toEqual({ Cafe: 25 });
  });

  it('keeps the target meta on a merge (target wins), dropping the source orphan', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryEmoji(db, 'Coffee', '☕');
    setCategoryHue(db, 'Coffee', 25);
    setCategoryEmoji(db, 'Drinks', '🍺');
    setCategoryHue(db, 'Drinks', 200);

    renameCategoryMeta(db, 'Coffee', 'Drinks');

    // Target's own emoji/hue survive; the source's are not merged in.
    expect(getEmojiMap(db)).toEqual({ Drinks: '🍺' });
    expect(getHueMap(db)).toEqual({ Drinks: 200 });
  });

  it('is a no-op when the source has no meta row', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryEmoji(db, 'Drinks', '🍺');

    renameCategoryMeta(db, 'Coffee', 'Drinks');

    expect(getEmojiMap(db)).toEqual({ Drinks: '🍺' });
  });

  it('is a no-op when from === to', () => {
    const db = initDb(':memory:');
    ensureCategoryMetaTable(db);
    setCategoryEmoji(db, 'Coffee', '☕');

    renameCategoryMeta(db, 'Coffee', 'Coffee');

    expect(getEmojiMap(db)).toEqual({ Coffee: '☕' });
  });
});
