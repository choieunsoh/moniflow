import { describe, it, expect } from 'vitest';
import { STARTER_CATEGORIES, STARTER_ACCOUNTS, STARTER_UNICONED } from './starter';
import { defaultEmojiFor, FALLBACK_EMOJI } from './default-emoji';

describe('the starter set', () => {
  it('has no duplicate names', () => {
    expect(new Set(STARTER_CATEGORIES).size).toBe(STARTER_CATEGORIES.length);
    expect(new Set(STARTER_ACCOUNTS).size).toBe(STARTER_ACCOUNTS.length);
  });

  // The whole point of seeding named categories rather than blank ones: they arrive iconed. A
  // reworded entry that stops matching default-emoji's keyword table would quietly ship a grid of
  // identical neutral tags — the exact failure default-emoji was written to end.
  it('gives every category a real glyph, except the one meant to be neutral', () => {
    const fellBack = STARTER_CATEGORIES.filter((c) => defaultEmojiFor(c) === FALLBACK_EMOJI);
    expect(fellBack).toEqual([STARTER_UNICONED]);
  });

  it('keeps the deliberately-neutral name in the set', () => {
    expect(STARTER_CATEGORIES).toContain(STARTER_UNICONED);
  });

  // Small on purpose — this is a scaffold to rename, and a long list is one nobody edits.
  it('stays short enough to read at a glance', () => {
    expect(STARTER_CATEGORIES.length).toBeLessThanOrEqual(12);
    expect(STARTER_ACCOUNTS.length).toBeLessThanOrEqual(4);
  });
});
