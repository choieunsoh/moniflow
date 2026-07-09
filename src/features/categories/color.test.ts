import { describe, it, expect } from 'vitest';
import { categoryColor } from './color';

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
