import { describe, expect, it } from 'vitest';
import { resolveSwipe } from './swipe';

const W = 88; // panel width; threshold = 44

describe('resolveSwipe', () => {
  it('stays closed below the threshold either way', () => {
    expect(resolveSwipe(0, W)).toBe(0);
    expect(resolveSwipe(-43, W)).toBe(0);
    expect(resolveSwipe(43, W)).toBe(0);
  });

  it('opens the delete side on a left swipe past the threshold', () => {
    expect(resolveSwipe(-44, W)).toBe(-1);
    expect(resolveSwipe(-88, W)).toBe(-1);
  });

  it('opens the edit side on a right swipe past the threshold', () => {
    expect(resolveSwipe(44, W)).toBe(1);
    expect(resolveSwipe(88, W)).toBe(1);
  });

  it('honours a custom threshold', () => {
    expect(resolveSwipe(20, W, 16)).toBe(1);
    expect(resolveSwipe(-20, W, 16)).toBe(-1);
    expect(resolveSwipe(10, W, 16)).toBe(0);
  });
});
