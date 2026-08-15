import { describe, it, expect } from 'vitest';
import { yearSummary } from './year';
import { lastCycles } from './cycle';
import type { EntryRow } from './schema';

const CUTOFF = 18;

// Minimal EntryRow factory — only the fields yearSummary reads matter.
function e(date: string, amount: number, category = 'Food', note: string | null = null): EntryRow {
  return {
    id: Math.abs(hash(date + amount + category)),
    date,
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: null,
    originalAmount: null,
    note,
    source: 'manual',
    offBudget: null,
    category,
    account: 'Cash',
  };
}
function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return h;
}

describe('yearSummary', () => {
  // 12 real cycles ending at 2026-07 (cutoff 18). Each cycle N runs its 18th → next 17th.
  const cycles = lastCycles('2026-07', 12, CUTOFF);

  it('totals, buckets into 12 bars, and ranks categories window-wide', () => {
    const entries = [
      e('2026-06-20', -1000, 'Food'), // June cycle (2026-06)
      e('2026-06-25', -500, 'Fun'), // June cycle
      e('2026-05-19', -300, 'Food'), // May cycle (2026-05)
    ];
    const s = yearSummary(entries, cycles, '2026-07');
    expect(s.bars).toHaveLength(12);
    expect(s.total).toBe(1800);
    expect(s.bars.find((b) => b.key === '2026-06')?.value).toBe(1500);
    expect(s.bars.find((b) => b.key === '2026-05')?.value).toBe(300);
    expect(s.categories).toEqual([
      { name: 'Food', value: 1300, count: 2 },
      { name: 'Fun', value: 500, count: 1 },
    ]);
  });

  it('picks the biggest COMPLETE month and averages over complete cycles with spend', () => {
    const entries = [
      e('2026-05-19', -2000, 'Food'), // May: 2000
      e('2026-06-20', -1000, 'Food'), // June: 1000
      e('2026-07-20', -9999, 'Food'), // July = current/partial — must NOT be "biggest month"
    ];
    const s = yearSummary(entries, cycles, '2026-07');
    expect(s.biggestMonth).toEqual({ key: '2026-05', label: 'May', value: 2000 });
    // average over complete-with-spend (May 2000, June 1000) — July excluded as partial
    expect(s.avgPerCycle).toBe(1500);
    expect(s.activeCycleCount).toBe(2);
  });

  it('delegates biggest transaction, top notes, and weekday to the shared helpers', () => {
    const entries = [
      e('2026-06-20', -800, 'Food', 'Sushi'),
      e('2026-06-21', -1200, 'Fun', 'Concert'),
    ];
    const s = yearSummary(entries, cycles, '2026-07');
    expect(s.biggestTransaction?.note).toBe('Concert');
    expect(s.topNotes[0]).toEqual({ note: 'Concert', total: 1200, count: 1 });
    expect(s.weekday.totalCount).toBe(2);
  });

  it('nets a refund against spend in the same cycle and category', () => {
    const entries = [e('2026-06-20', -2000, 'Food'), e('2026-06-20', 500, 'Food')];
    const s = yearSummary(entries, cycles, '2026-07');
    expect(s.bars.find((b) => b.key === '2026-06')?.value).toBe(1500);
    expect(s.categories).toEqual([{ name: 'Food', value: 1500, count: 2 }]);
  });

  it('is empty and null-safe on no entries', () => {
    const s = yearSummary([], cycles, '2026-07');
    expect(s.total).toBe(0);
    expect(s.categories).toEqual([]);
    expect(s.biggestMonth).toBeNull();
    expect(s.biggestTransaction).toBeNull();
    expect(s.avgPerCycle).toBeNull();
    expect(s.bars).toHaveLength(12);
  });
});
