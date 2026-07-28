import { describe, it, expect } from 'vitest';
import { EMOJI_CHOICES } from './queries';
import { PHOSPHOR_ICONS } from './icon-map.phosphor';
import { LUCIDE_ICONS } from './icon-map.lucide';

// The icon maps are keyed by EMOJI, not by category name (see icon-for.ts): a category gets a line
// icon only if its emoji is a key here. So a new category silently renders the raw emoji on a tinted
// disc — visibly unlike its neighbours — whenever its emoji was never added to these maps. That is
// how 📦 shipped unmapped. These tests pin the relationship so the next gap fails a run instead of a
// glance.

// Lucide genuinely has no equivalent for these four, so they intentionally fall back to the emoji.
// This is an allowlist, not a wish list: adding a fifth entry should require justifying it here.
const LUCIDE_HAS_NO_EQUIVALENT = new Set([
  '🍵', // no TeaBag
  '🍾', // no champagne bottle
  '👗', // no Dress (Shirt is already 👕)
  '🇰🇷', // no won sign
]);

// EMOJI_CHOICES is `as const`, so a bare `new Set(...)` narrows to the literal union and rejects a
// plain string lookup. Widen it here rather than casting at each call site.
const choices: ReadonlySet<string> = new Set<string>(EMOJI_CHOICES);

describe('icon maps', () => {
  it('offers 📦 in the picker and maps it in both sets', () => {
    expect(choices.has('📦')).toBe(true);
    expect(PHOSPHOR_ICONS['📦']).toBeDefined();
    expect(LUCIDE_ICONS['📦']).toBeDefined();
  });

  it('phosphor covers every picker choice', () => {
    const missing = EMOJI_CHOICES.filter((e) => PHOSPHOR_ICONS[e] === undefined);
    expect(missing).toEqual([]);
  });

  it('lucide covers every picker choice except the documented four', () => {
    const missing = EMOJI_CHOICES.filter(
      (e) => LUCIDE_ICONS[e] === undefined && !LUCIDE_HAS_NO_EQUIVALENT.has(e),
    );
    expect(missing).toEqual([]);
  });

  it('neither map holds an icon the picker cannot offer', () => {
    expect(Object.keys(PHOSPHOR_ICONS).filter((e) => !choices.has(e))).toEqual([]);
    expect(Object.keys(LUCIDE_ICONS).filter((e) => !choices.has(e))).toEqual([]);
  });
});
