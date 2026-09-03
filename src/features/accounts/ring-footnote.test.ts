import { describe, expect, it } from 'vitest';
import { refundedAccountBars } from './ring-footnote';
import type { Bar } from '@features/entries/breakdown';

function bar(key: string, total: number): Bar {
  return { key, total, count: 1, pct: 0, share: 0 };
}

describe('refundedAccountBars', () => {
  it('names an account whose refunds outweighed its spend', () => {
    expect(refundedAccountBars([bar('เกมส์', 50)])).toEqual([bar('เกมส์', 50)]);
  });

  it('drops an account whose spend and refunds cancelled out exactly', () => {
    expect(refundedAccountBars([bar('Grab', 0)])).toEqual([]);
  });
});
