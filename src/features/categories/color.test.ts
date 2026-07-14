import { describe, it, expect } from 'vitest';
import {
  categoryColor,
  categoryColorBold,
  discForeground,
  isValidDiscHue,
  GRAY_BASE,
  GRAY_PRESETS,
} from './color';

describe('categoryColor', () => {
  it('is deterministic — same name yields the same color', () => {
    expect(categoryColor('Food')).toBe(categoryColor('Food'));
  });

  it('returns a valid hsl() string', () => {
    expect(categoryColor('Transport')).toMatch(/^hsl\(\d{1,3} 60% 55%\)$/);
  });

  it('generally distinguishes different names', () => {
    expect(categoryColor('Food')).not.toBe(categoryColor('Transport'));
  });
});

describe('greyscale disc encoding', () => {
  it('renders a hue as a saturated bold disc', () => {
    expect(categoryColorBold('X', 0)).toBe('hsl(0 55% 46%)');
  });

  it('renders a grey sentinel as a neutral disc at its lightness', () => {
    expect(categoryColorBold('X', GRAY_BASE + 0)).toBe('hsl(0 0% 0%)'); // black
    expect(categoryColorBold('X', GRAY_BASE + 100)).toBe('hsl(0 0% 100%)'); // white
    expect(categoryColorBold('X', GRAY_BASE + 40)).toBe('hsl(0 0% 40%)');
  });

  it('keeps the glyph white on dark discs and flips it near-black past L 50%', () => {
    expect(discForeground(0)).toBe('#fff'); // any hue disc is fixed-dark
    expect(discForeground(null)).toBe('#fff'); // auto (name-derived hue)
    expect(discForeground(GRAY_BASE + 0)).toBe('#fff'); // black disc
    expect(discForeground(GRAY_BASE + 40)).toBe('#fff'); // still dark enough
    expect(discForeground(GRAY_BASE + 50)).toBe('#1a1a1a'); // threshold flips
    expect(discForeground(GRAY_BASE + 100)).toBe('#1a1a1a'); // white disc
  });

  it('validates hues (0–359) and grey sentinels, rejecting the gap between', () => {
    expect(isValidDiscHue(0)).toBe(true);
    expect(isValidDiscHue(359)).toBe(true);
    expect(isValidDiscHue(360)).toBe(false);
    expect(isValidDiscHue(GRAY_BASE)).toBe(true);
    expect(isValidDiscHue(GRAY_BASE + 100)).toBe(true);
    expect(isValidDiscHue(GRAY_BASE + 101)).toBe(false);
    expect(isValidDiscHue(500)).toBe(false); // in the gap
    expect(isValidDiscHue(1.5)).toBe(false); // non-integer
  });

  it('every grey preset is a valid, in-range sentinel', () => {
    for (const p of GRAY_PRESETS) expect(isValidDiscHue(p.hue)).toBe(true);
  });
});
