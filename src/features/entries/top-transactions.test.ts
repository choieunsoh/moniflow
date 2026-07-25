import { describe, it, expect } from 'vitest';
import { topTransactions, TOP_TX_LIMIT } from './top-transactions';
import type { EntryRow } from './schema';

// Minimal EntryRow factory — only the fields topTransactions reads matter; the rest are filled to
// satisfy the type. Amounts are negative (outflows), matching the ledger.
function row(id: number, amount: number): EntryRow {
  return {
    id,
    date: '2026-07-20',
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
    category: 'Food',
    account: 'Cash',
  };
}

describe('topTransactions', () => {
  it('ranks by magnitude (biggest outflow first) and caps at the limit', () => {
    const entries = [
      row(1, -100),
      row(2, -900),
      row(3, -50),
      row(4, -300),
      row(5, -20),
      row(6, -600),
    ];
    const top = topTransactions(entries, 3);
    expect(top.map((e) => e.id)).toEqual([2, 6, 4]); // 900, 600, 300
  });

  it('defaults to TOP_TX_LIMIT and does not mutate the input', () => {
    const entries = [row(1, -10), row(2, -20), row(3, -30), row(4, -40), row(5, -50), row(6, -60)];
    const snapshot = entries.map((e) => e.id);
    const top = topTransactions(entries);
    expect(top).toHaveLength(TOP_TX_LIMIT); // 5
    expect(top[0].id).toBe(6); // largest
    expect(entries.map((e) => e.id)).toEqual(snapshot); // input order untouched
  });

  it('returns everything (sorted) when fewer than the limit', () => {
    expect(topTransactions([row(1, -10), row(2, -30)], 5).map((e) => e.id)).toEqual([2, 1]);
  });
});
