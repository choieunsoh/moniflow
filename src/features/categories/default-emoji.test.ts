import { describe, expect, it } from 'vitest';
import { defaultEmojiFor, FALLBACK_EMOJI, DEFAULT_EMOJI_KEYWORDS } from './default-emoji';
import { EMOJI_CHOICES } from './queries';

describe('defaultEmojiFor', () => {
  it('recognises the common expense categories a Monefy import brings in', () => {
    expect(defaultEmojiFor('Rent')).toBe('🏠');
    expect(defaultEmojiFor('Transport')).toBe('🚌');
    expect(defaultEmojiFor('Health')).toBe('🏥');
    expect(defaultEmojiFor('Clothes')).toBe('👕');
    expect(defaultEmojiFor('Books')).toBe('📚');
    expect(defaultEmojiFor('Pets')).toBe('🐶');
    expect(defaultEmojiFor('Education')).toBe('🎓');
    expect(defaultEmojiFor('Gifts')).toBe('🎁');
  });

  it('matches on a keyword inside a longer, punctuated name', () => {
    // Real names off the reference ledger — the match has to survive an ampersand and a second noun.
    expect(defaultEmojiFor('Food & Groceries')).toBe('🛒');
    expect(defaultEmojiFor('Utilities & Internet Bills')).toBe('💡');
    expect(defaultEmojiFor('Electronics and Very Long Household Appliances')).toBe('💻');
  });

  it('ignores case', () => {
    expect(defaultEmojiFor('COFFEE')).toBe('☕');
    expect(defaultEmojiFor('coffee')).toBe('☕');
    expect(defaultEmojiFor('Coffee')).toBe('☕');
  });

  // Substring collisions are the one way a keyword table quietly goes wrong: the shorter word is
  // inside the longer one, so whichever is tested first wins for BOTH. Each pair below is ordered
  // deliberately in the table, and each is pinned here so a later edit can't silently reorder them.
  describe('substring collisions', () => {
    it('reads Taxi as a taxi, not as tax', () => {
      expect(defaultEmojiFor('Taxi')).toBe('🚕');
      expect(defaultEmojiFor('Tax')).toBe('🧾');
    });

    it('reads Petrol as fuel, not as a pet', () => {
      expect(defaultEmojiFor('Petrol')).toBe('⛽');
      expect(defaultEmojiFor('Pets')).toBe('🐶');
    });

    it('reads Card as a card, not as a car', () => {
      expect(defaultEmojiFor('Card fees')).toBe('💳');
    });
  });

  // Every name below is a real category off the reference Monefy export. They are the reason this
  // table exists at all: with an English-only table this exact ledger came back with eleven of its
  // twelve categories still on the neutral tag, which is the same "icon column carries nothing"
  // failure the seeding was written to fix — just in the language the app is actually used in.
  describe('Thai category names', () => {
    it('reads the categories a real Thai Monefy export brings in', () => {
      expect(defaultEmojiFor('ช็อปปิ้ง')).toBe('🛍️'); // shopping
      expect(defaultEmojiFor('บิลรายเดือน')).toBe('🧾'); // monthly bills
      expect(defaultEmojiFor('ผ่อนสินค้า')).toBe('💳'); // instalments
      expect(defaultEmojiFor('เกมส์')).toBe('🎮'); // games
      expect(defaultEmojiFor('รักษาพยาบาล')).toBe('🏥'); // medical
      expect(defaultEmojiFor('ขนม')).toBe('🍰'); // snacks
      expect(defaultEmojiFor('รถไฟฟ้า')).toBe('🚆'); // skytrain
    });

    it('matches through the # prefix Monefy allows on a category', () => {
      expect(defaultEmojiFor('#กาแฟ')).toBe('☕');
      expect(defaultEmojiFor('#อาหาร')).toBe('🍔');
      expect(defaultEmojiFor('#สะดวกซื้อ')).toBe('🛒');
    });

    // Thai is written without word spaces, so a short word hides inside longer unrelated ones far
    // more easily than in English. This is the one that actually bit: ยา (medicine) is inside
    // รักษาพยาบาล (medical treatment).
    it('reads รักษาพยาบาล as medical care, not as the ยา inside it', () => {
      expect(defaultEmojiFor('รักษาพยาบาล')).toBe('🏥');
      expect(defaultEmojiFor('ยา')).toBe('💊');
    });

    it('handles a mixed Thai/English name', () => {
      expect(defaultEmojiFor('Grab Food')).toBe('🍔');
    });
  });

  // A wrong icon is worse than no icon: a coloured disc with a meaningless glyph is decoration
  // wearing an information costume, and a CONFIDENTLY wrong one is worse still. Anything without a
  // clearly right match keeps the neutral tag, which reads honestly as "nothing assigned".
  it('falls back rather than guessing at a category it does not recognise', () => {
    expect(defaultEmojiFor('Misc')).toBe(FALLBACK_EMOJI);
    expect(defaultEmojiFor('Insurance')).toBe(FALLBACK_EMOJI);
    expect(defaultEmojiFor('Qwertyuiop')).toBe(FALLBACK_EMOJI);
    expect(defaultEmojiFor('')).toBe(FALLBACK_EMOJI);
  });

  // The picker renders EMOJI_CHOICES and marks the current one selected. A seeded emoji outside that
  // set would show as a category icon that the picker cannot highlight — the user would open it and
  // see nothing chosen. This also catches a mistyped variation selector, which is invisible on sight.
  it('only ever seeds an emoji the picker can show as selected', () => {
    const choices = new Set<string>(EMOJI_CHOICES);
    for (const [keyword, emoji] of DEFAULT_EMOJI_KEYWORDS) {
      expect(choices.has(emoji), `"${keyword}" -> ${emoji} is not in EMOJI_CHOICES`).toBe(true);
    }
  });

  it('has no duplicate keywords', () => {
    const seen = DEFAULT_EMOJI_KEYWORDS.map(([keyword]) => keyword);
    expect(new Set(seen).size).toBe(seen.length);
  });
});
