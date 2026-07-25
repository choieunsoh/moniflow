import { describe, it, expect } from 'vitest';
import { byWeekday } from './by-weekday';
import type { EntryRow } from './schema';

// Minimal EntryRow factory — only the fields byWeekday reads matter.
function e(date: string, amount: number): EntryRow {
  return {
    id: 1,
    date,
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

describe('byWeekday', () => {
  // 2026-07-24 is a Friday; 2026-07-25 Saturday; 2026-07-26 Sunday; 2026-07-27 Monday (UTC).
  it('buckets magnitudes by UTC weekday, Mon..Sun order', () => {
    const stats = byWeekday([e('2026-07-27', -100), e('2026-07-24', -300), e('2026-07-24', -50)]);
    expect(stats.rows.map((r) => r.day)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(stats.rows.find((r) => r.day === 'Fri')).toEqual({ day: 'Fri', total: 350, count: 2 });
    expect(stats.rows.find((r) => r.day === 'Mon')).toEqual({ day: 'Mon', total: 100, count: 1 });
    expect(stats.totalCount).toBe(3);
  });

  it('names the peak day', () => {
    const stats = byWeekday([e('2026-07-24', -300), e('2026-07-27', -100)]);
    expect(stats.peak?.day).toBe('Fri');
  });

  it('has no peak and null ratio when empty', () => {
    const stats = byWeekday([]);
    expect(stats.peak).toBeNull();
    expect(stats.weekendRatio).toBeNull();
    expect(stats.totalCount).toBe(0);
  });

  it('computes weekend-vs-weekday ratio from per-slot averages (weekend/5 vs weekday/2 slots)', () => {
    // Weekday total 500 over 5 slots = 100/slot; weekend total 400 over 2 slots = 200/slot → 2.0
    const stats = byWeekday([e('2026-07-24', -500), e('2026-07-25', -400)]); // Fri weekday, Sat weekend
    expect(stats.weekendRatio).toBe(2);
  });
});
