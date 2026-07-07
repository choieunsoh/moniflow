import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import {
  addEntries,
  getEntries,
  getRecentEntries,
  replaceEntries,
  getCycleSummary,
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
} from './queries';

describe('replaceEntries', () => {
  it('wipes existing rows and inserts the new set', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [{ date: '2020-01-01', account: 'a', category: 'old', amount: -1 }]);
    replaceEntries(db, [
      { date: '2026-07-01', account: 'b', category: 'new', amount: -2 },
      { date: '2026-07-02', account: 'b', category: 'new', amount: -3 },
    ]);
    const rows = getEntries(db);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.category === 'new')).toBe(true);
  });

  it('clears to empty when given no rows', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [{ date: '2020-01-01', account: 'a', category: 'old', amount: -1 }]);
    replaceEntries(db, []);
    expect(getEntries(db)).toHaveLength(0);
  });

  // 5000 rows × 7 bound columns = 35,000 params — over SQLite's 32,766 variable cap. This size is
  // deliberate: a single-batch insert (the pre-fix bug) throws "too many SQL variables" here, so
  // reverting the chunking would fail this test. A smaller set would pass either way and guard
  // nothing.
  it('inserts a set larger than the SQLite variable cap in one call', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    const many = Array.from({ length: 5000 }, () => ({
      date: '2026-07-01',
      account: 'visa',
      category: 'food',
      amount: -1,
      currency: 'THB',
      originalAmount: -1,
      note: null,
    }));
    replaceEntries(db, many);
    expect(getEntries(db)).toHaveLength(5000);
  });
});

describe('cycle-scoped queries', () => {
  function seed() {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-17', account: 'visa', category: 'food', amount: -100 }, // before cycle
      { date: '2026-07-18', account: 'visa', category: 'food', amount: -200 },
      { date: '2026-07-20', account: 'cash', category: 'food', amount: -50 },
      { date: '2026-08-01', account: 'visa', category: 'travel', amount: -300 },
      { date: '2026-08-18', account: 'visa', category: 'food', amount: -999 }, // next cycle
    ]);
    return db;
  }

  it('summarizes only rows within [start, end]', () => {
    const s = getCycleSummary(seed(), '2026-07-18', '2026-08-17');
    expect(s).toEqual({ net: -550, inflow: 0, outflow: -550, count: 3 });
  });

  it('breaks down by category, largest magnitude first', () => {
    const b = getCategoryBreakdown(seed(), '2026-07-18', '2026-08-17');
    expect(b).toEqual([
      { key: 'travel', total: -300 },
      { key: 'food', total: -250 },
    ]);
  });

  it('breaks down by account', () => {
    const b = getAccountBreakdown(seed(), '2026-07-18', '2026-08-17');
    expect(b).toEqual([
      { key: 'visa', total: -500 },
      { key: 'cash', total: -50 },
    ]);
  });

  it('returns the raw entries in range', () => {
    expect(getEntriesInRange(seed(), '2026-07-18', '2026-08-17')).toHaveLength(3);
  });
});

describe('getRecentEntries', () => {
  it('orders by date desc, then time desc, then id desc — untimed rows sort last', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', time: '09:00', account: 'cash', category: 'food', amount: -10 },
      { date: '2026-07-01', time: '18:30', account: 'cash', category: 'food', amount: -20 },
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -5 }, // no time
      { date: '2026-07-02', account: 'cash', category: 'food', amount: -1 }, // no time
    ]);
    const rows = getRecentEntries(db, 10);
    expect(rows.map((r) => [r.date, r.time])).toEqual([
      ['2026-07-02', null],
      ['2026-07-01', '18:30'],
      ['2026-07-01', '09:00'],
      ['2026-07-01', null],
    ]);
  });
});
