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

  it('keys on account when account is one of the fields', () => {
    const rows = [
      row({ id: 1, accountId: 1, account: 'เงินสด' }),
      row({ id: 2, accountId: 2, account: 'บัตรเครดิต' }),
    ];
    // The historical rule ignores account, so these two group.
    expect(findDuplicateGroups(rows)).toHaveLength(1);
    // Adding account to the key separates them.
    expect(findDuplicateGroups(rows, ['date', 'amount', 'category', 'account'])).toEqual([]);
  });

  it('drops date from the key so rows on different dates can group', () => {
    const rows = [row({ id: 1, date: '2026-09-01' }), row({ id: 2, date: '2026-09-04' })];
    expect(findDuplicateGroups(rows)).toEqual([]);
    const groups = findDuplicateGroups(rows, ['amount', 'category']);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((r) => r.id)).toEqual([1, 2]);
  });

  it('treats a null note and an empty note as the same note', () => {
    const groups = findDuplicateGroups(
      [row({ id: 1, note: null }), row({ id: 2, note: '   ' })],
      ['date', 'amount', 'category', 'note'],
    );
    expect(groups).toHaveLength(1);
  });

  it('separates rows whose notes differ once note is keyed', () => {
    const rows = [row({ id: 1, note: 'ข้าวเช้า' }), row({ id: 2, note: 'ข้าวเย็น' })];
    expect(findDuplicateGroups(rows)).toHaveLength(1);
    expect(findDuplicateGroups(rows, ['date', 'amount', 'category', 'note'])).toEqual([]);
  });

  it('ignores surrounding whitespace when comparing notes', () => {
    const groups = findDuplicateGroups(
      [row({ id: 1, note: 'กาแฟ' }), row({ id: 2, note: '  กาแฟ  ' })],
      ['note'],
    );
    expect(groups).toHaveLength(1);
  });

  // With nothing to key on every row shares one key and the whole ledger becomes a single group.
  // The UI makes this unreachable, but the function is exported and must stay total.
  it('returns nothing when no fields are given', () => {
    expect(findDuplicateGroups([row({ id: 1 }), row({ id: 2 })], [])).toEqual([]);
  });

  // The group heading order used to be recovered by slicing the key string, which silently read the
  // amount as a date the moment date left the key.
  it('orders groups newest first by the oldest row in each group, with date unkeyed', () => {
    const groups = findDuplicateGroups(
      [
        row({ id: 1, date: '2026-07-01', amount: -10 }),
        row({ id: 2, date: '2026-07-02', amount: -10 }),
        row({ id: 3, date: '2026-09-01', amount: -20 }),
        row({ id: 4, date: '2026-09-02', amount: -20 }),
      ],
      ['amount', 'category'],
    );
    expect(groups.map((g) => g[0].date)).toEqual(['2026-09-01', '2026-07-01']);
  });
});
