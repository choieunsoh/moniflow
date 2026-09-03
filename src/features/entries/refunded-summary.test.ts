import { describe, expect, it } from 'vitest';
import { refundedSummary } from './refunded-summary';
import type { Breakdown } from './queries';

function row(key: string, total: number, count = 1): Breakdown {
  return { key, total, count };
}

describe('refundedSummary', () => {
  it('names a category whose refunds outweighed its spend', () => {
    expect(refundedSummary([row('เกมส์', 50), row('อาหาร', -200)])).toEqual({
      refunded: 50,
      categories: ['เกมส์'],
    });
  });

  it('returns zero and no categories when nothing was refunded', () => {
    expect(refundedSummary([row('อาหาร', -200), row('เดินทาง', -50)])).toEqual({
      refunded: 0,
      categories: [],
    });
  });
});
