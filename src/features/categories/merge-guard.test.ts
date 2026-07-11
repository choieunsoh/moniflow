import { describe, it, expect } from 'vitest';
import { willMerge } from './merge-guard';

describe('willMerge', () => {
  const existing = ['Coffee', 'Drinks', 'ช็อปปิ้ง'];

  it('is a merge when the new name is another existing category', () => {
    expect(willMerge('Drinks', 'Coffee', existing)).toBe(true);
  });

  it('is not a merge for a brand-new name', () => {
    expect(willMerge('Cafe', 'Coffee', existing)).toBe(false);
  });

  it('is not a merge when renaming to itself (no-op)', () => {
    expect(willMerge('Coffee', 'Coffee', existing)).toBe(false);
  });

  it('trims before matching (a spaced name still collides)', () => {
    expect(willMerge('  Drinks  ', 'Coffee', existing)).toBe(true);
  });

  it('is not a merge for empty / whitespace-only input', () => {
    expect(willMerge('', 'Coffee', existing)).toBe(false);
    expect(willMerge('   ', 'Coffee', existing)).toBe(false);
  });

  it('folding a whitespace fragment into its clean name is a merge (confirm it)', () => {
    // from = the fragment 'ช็อปปิ้ง ' (trailing space); to = the existing clean 'ช็อปปิ้ง'.
    expect(willMerge('ช็อปปิ้ง', 'ช็อปปิ้ง ', existing)).toBe(true);
  });
});
