import { describe, expect, it } from 'vitest';
import { groupBySpend } from './by-spend';
import type { EntryRow } from './schema';

function entry(id: number, category: string, amount: number, account = 'Cash'): EntryRow {
  return {
    id,
    date: '2026-07-01',
    time: null,
    accountId: 1,
    account,
    categoryId: 1,
    category,
    amount,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
  };
}

const byCategory = (e: EntryRow) => e.category;
const byAccount = (e: EntryRow) => e.account;

describe('groupBySpend', () => {
  it('buckets by the keyed field, largest spend first', () => {
    const groups = groupBySpend(
      [entry(1, 'Food', -10), entry(2, 'Rent', -500), entry(3, 'Food', -20)],
      byCategory,
    );
    expect(groups.map((g) => g.key)).toEqual(['Rent', 'Food']);
  });

  it('preserves input order of entries within a bucket', () => {
    const groups = groupBySpend([entry(1, 'Food', -10), entry(3, 'Food', -20)], byCategory);
    expect(groups[0].entries.map((e) => e.id)).toEqual([1, 3]);
  });

  it('sums the signed total per bucket', () => {
    const groups = groupBySpend([entry(1, 'Food', -10), entry(2, 'Food', -20)], byCategory);
    expect(groups[0].total).toBe(-30);
  });

  it('returns an empty array for no entries', () => {
    expect(groupBySpend([], byCategory)).toEqual([]);
  });

  // Every fixture above is all-negative, where sorting by signed total and by magnitude give the same
  // order — neither can tell `a.total - b.total` apart from `Math.abs(b.total) - Math.abs(a.total)`.
  // A net-positive (refund-heavy) bucket is the case that splits them: by signed total it sorts to the
  // bottom (it owes nothing back); by magnitude a big refund would outrank a small spend.
  it('sorts by signed total, not magnitude — a net-positive bucket sorts last', () => {
    const groups = groupBySpend([entry(1, 'Food', -10), entry(2, 'Gifts', 500)], byCategory);
    expect(groups.map((g) => g.key)).toEqual(['Food', 'Gifts']);
  });

  // The same function drives the Records "by account" tab — only the accessor differs.
  it('buckets by account, largest spend first', () => {
    const groups = groupBySpend(
      [
        entry(1, 'Food', -10, 'Cash'),
        entry(2, 'Rent', -500, 'Bangkok Bank'),
        entry(3, 'Food', -20, 'Cash'),
      ],
      byAccount,
    );
    expect(groups.map((g) => g.key)).toEqual(['Bangkok Bank', 'Cash']);
    expect(groups[1].total).toBe(-30);
  });
});
