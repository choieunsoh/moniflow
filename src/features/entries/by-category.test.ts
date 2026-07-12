import { describe, expect, it } from 'vitest';
import { groupByCategory } from './by-category';
import type { EntryRow } from './schema';

function entry(id: number, category: string, amount: number): EntryRow {
  return {
    id,
    date: '2026-07-01',
    time: null,
    accountId: 1,
    account: 'acct',
    categoryId: 1,
    category,
    amount,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
  };
}

describe('groupByCategory', () => {
  it('buckets by category, largest spend first', () => {
    const groups = groupByCategory([
      entry(1, 'Food', -10),
      entry(2, 'Rent', -500),
      entry(3, 'Food', -20),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Rent', 'Food']);
  });

  it('preserves input order of entries within a category', () => {
    const groups = groupByCategory([entry(1, 'Food', -10), entry(3, 'Food', -20)]);
    expect(groups[0].entries.map((e) => e.id)).toEqual([1, 3]);
  });

  it('sums the signed total per category', () => {
    const groups = groupByCategory([entry(1, 'Food', -10), entry(2, 'Food', -20)]);
    expect(groups[0].total).toBe(-30);
  });

  it('returns an empty array for no entries', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
