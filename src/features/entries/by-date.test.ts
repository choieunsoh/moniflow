import { describe, expect, it } from 'vitest';
import { groupByDate } from './by-date';
import type { Entry } from './schema';

function entry(id: number, date: string, amount: number): Entry {
  return {
    id,
    date,
    time: null,
    account: 'acct',
    category: 'cat',
    amount,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
  };
}

describe('groupByDate', () => {
  it('buckets by date, newest day first', () => {
    const groups = groupByDate([
      entry(1, '2026-07-01', -10),
      entry(2, '2026-07-03', -5),
      entry(3, '2026-07-01', -20),
    ]);
    expect(groups.map((g) => g.date)).toEqual(['2026-07-03', '2026-07-01']);
  });

  it('preserves input order of entries within a day', () => {
    const groups = groupByDate([entry(1, '2026-07-01', -10), entry(3, '2026-07-01', -20)]);
    expect(groups[0].entries.map((e) => e.id)).toEqual([1, 3]);
  });

  it('sums the signed total per day', () => {
    const groups = groupByDate([entry(1, '2026-07-01', -10), entry(2, '2026-07-01', -20)]);
    expect(groups[0].total).toBe(-30);
  });

  it('returns an empty array for no entries', () => {
    expect(groupByDate([])).toEqual([]);
  });
});
