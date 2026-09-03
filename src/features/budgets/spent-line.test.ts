import { describe, expect, it } from 'vitest';
import { spentLine } from './spent-line';

describe('spentLine', () => {
  it('says refunded when refunds outweighed spend, rather than a negative spent', () => {
    expect(spentLine(-888)).toBe('฿888.00 refunded');
  });

  it('says spent for an ordinary category', () => {
    expect(spentLine(1200)).toBe('฿1,200.00 spent');
  });

  it('says spent for zero, because nothing was handed back', () => {
    expect(spentLine(0)).toBe('฿0.00 spent');
  });
});
