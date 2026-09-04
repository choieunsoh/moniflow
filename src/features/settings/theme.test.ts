import { describe, it, expect } from 'vitest';
import {
  ACCENTS,
  ACCENT_LABELS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  isAccent,
  isTheme,
  readAccent,
  readTheme,
  THEMES,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme values', () => {
  it('offers exactly the three theme states, defaulting to system', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark']);
    expect(DEFAULT_THEME).toBe('system');
  });

  it('offers nine accents with ink first, because ink is the default and stamps no attribute', () => {
    expect(ACCENTS).toHaveLength(9);
    expect(ACCENTS[0]).toBe('ink');
    expect(DEFAULT_ACCENT).toBe('ink');
  });

  it('names every accent, so two palettes 8 degrees apart are not told apart by a dot alone', () => {
    for (const accent of ACCENTS) expect(ACCENT_LABELS[accent].length).toBeGreaterThan(0);
  });

  it('accepts only known values', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('DARK')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isAccent('teal')).toBe(true);
    expect(isAccent('purple')).toBe(false);
    expect(isAccent(7)).toBe(false);
  });

  it("reads anything unreadable as the default: absent, corrupt, or another app's key", () => {
    expect(readTheme(null)).toBe('system');
    expect(readTheme('')).toBe('system');
    expect(readTheme('midnight')).toBe('system');
    expect(readTheme('light')).toBe('light');
    expect(readAccent(null)).toBe('ink');
    expect(readAccent('fuchsia')).toBe('ink');
    expect(readAccent('azure')).toBe('azure');
  });

  // The pre-paint script in layout.tsx cannot import a module, so it inlines these two strings.
  // If either changes here without changing there, the app flashes the wrong theme on every load.
  it('pins the storage keys the pre-paint inline script duplicates', () => {
    expect(THEME_STORAGE_KEY).toBe('moniflow_theme');
    expect(ACCENT_STORAGE_KEY).toBe('moniflow_accent');
  });
});
