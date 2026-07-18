import { describe, it, expect } from 'vitest';
import { toBars } from './breakdown';

describe('toBars', () => {
  it('scales each row to a 0–100 pct of the largest magnitude', () => {
    expect(
      toBars([
        { key: 'a', total: -300, count: 4 },
        { key: 'b', total: -150, count: 2 },
      ]),
    ).toEqual([
      // pct is bar WIDTH (relative to the biggest row); share is the slice of the cycle, which is
      // what the donut legend prints — different numbers, and both are needed.
      { key: 'a', total: -300, count: 4, pct: 100, share: 67 }, // count passes through untouched
      { key: 'b', total: -150, count: 2, pct: 50, share: 33 },
    ]);
  });

  it('reports share against the whole set, matching the donut legend', () => {
    // Four equal rows are 25% each, and none is 100% just for topping the list — which is exactly
    // where share and pct diverge, and why the list needed its own number rather than reusing pct.
    const bars = toBars([
      { key: 'a', total: -100, count: 1 },
      { key: 'b', total: -100, count: 1 },
      { key: 'c', total: -100, count: 1 },
      { key: 'd', total: -100, count: 1 },
    ]);
    expect(bars.map((b) => b.share)).toEqual([25, 25, 25, 25]);
    expect(bars.map((b) => b.pct)).toEqual([100, 100, 100, 100]);
  });

  it('returns an empty array unchanged (no divide-by-zero)', () => {
    expect(toBars([])).toEqual([]);
  });

  it('reports a zero share rather than NaN when nothing was spent', () => {
    expect(toBars([{ key: 'a', total: 0, count: 0 }])).toEqual([
      { key: 'a', total: 0, count: 0, pct: 0, share: 0 },
    ]);
  });
});
