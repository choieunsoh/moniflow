import { describe, it, expect } from 'vitest';
import { findDuplicateGroups } from './duplicates';
import type { EntryRow } from './schema';

function row(over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 1,
    date: '2026-09-01',
    time: null,
    accountId: 1,
    categoryId: 7,
    amount: -120,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
    category: 'อาหาร',
    account: 'เงินสด',
    ...over,
  };
}

describe('findDuplicateGroups', () => {
  it('returns nothing for a clean ledger', () => {
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, amount: -50 })])).toEqual([]);
  });

  it('groups two rows sharing date, amount and category', () => {
    const groups = findDuplicateGroups([row({ id: 1 }), row({ id: 2 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((r) => r.id)).toEqual([1, 2]);
  });

  it('groups rows that differ ONLY by account', () => {
    const groups = findDuplicateGroups([
      row({ id: 1, accountId: 1, account: 'เงินสด' }),
      row({ id: 2, accountId: 2, account: 'บัตรเครดิต' }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it('separates rows differing in date, amount or category', () => {
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, date: '2026-09-02' })])).toEqual([]);
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, amount: -121 })])).toEqual([]);
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2, categoryId: 8 })])).toEqual([]);
  });

  it('keeps id order inside a group so the original comes first', () => {
    const groups = findDuplicateGroups([row({ id: 9 }), row({ id: 4 }), row({ id: 6 })]);
    expect(groups[0].map((r) => r.id)).toEqual([4, 6, 9]);
  });

  it('orders groups newest date first', () => {
    const groups = findDuplicateGroups([
      row({ id: 1, date: '2026-07-01' }),
      row({ id: 2, date: '2026-07-01' }),
      row({ id: 3, date: '2026-09-01' }),
      row({ id: 4, date: '2026-09-01' }),
    ]);
    expect(groups.map((g) => g[0].date)).toEqual(['2026-09-01', '2026-07-01']);
  });

  it('groups a refund with a refund, never a refund with an expense', () => {
    expect(
      findDuplicateGroups([row({ id: 1, amount: -120 }), row({ id: 2, amount: 120 })]),
    ).toEqual([]);
  });
});
