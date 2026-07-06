import { describe, it, expect } from 'vitest';
import { toBars } from './breakdown';

describe('toBars', () => {
  it('scales each row to a 0–100 pct of the largest magnitude', () => {
    expect(
      toBars([
        { key: 'a', total: -300 },
        { key: 'b', total: -150 },
      ]),
    ).toEqual([
      { key: 'a', total: -300, pct: 100 },
      { key: 'b', total: -150, pct: 50 },
    ]);
  });

  it('returns an empty array unchanged (no divide-by-zero)', () => {
    expect(toBars([])).toEqual([]);
  });
});
