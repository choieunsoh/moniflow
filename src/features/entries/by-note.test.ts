import { describe, it, expect } from 'vitest';
import { topNotes } from './by-note';
import type { EntryRow } from './schema';

function row(note: string | null, amount: number): EntryRow {
  return {
    id: 1,
    date: '2026-07-10',
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: null,
    originalAmount: null,
    note,
    source: 'manual',
    offBudget: null,
    category: 'Food',
    account: 'Cash',
  };
}

describe('topNotes', () => {
  it('nets totals per note, biggest first', () => {
    expect(topNotes([row('Starbucks', -120), row('7-11', -60), row('Starbucks', -80)])).toEqual([
      { note: 'Starbucks', total: 200, count: 2 },
      { note: '7-11', total: 60, count: 1 },
    ]);
  });

  it('buckets blank and null notes as "No note"', () => {
    expect(topNotes([row(null, -50), row('', -30), row('   ', -20)])).toEqual([
      { note: 'No note', total: 100, count: 3 },
    ]);
  });

  it('nets a refund carrying the same note', () => {
    expect(topNotes([row('Dinner', -2000), row('Dinner', 500)])).toEqual([
      { note: 'Dinner', total: 1500, count: 2 },
    ]);
  });
});
