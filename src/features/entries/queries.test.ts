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
  insertEntry,
  updateEntry,
  deleteEntry,
  getEntryById,
  getDistinctCategories,
  getDistinctAccounts,
} from './queries';

describe('replaceEntries', () => {
  it('replaces monefy-sourced rows but keeps hand-entered (manual) ones', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2020-01-01', account: 'a', category: 'imported-old', amount: -1, source: 'monefy' },
      { date: '2026-07-01', account: 'me', category: 'hand-entered', amount: -9, source: 'manual' },
    ]);
    replaceEntries(db, [
      { date: '2026-07-02', account: 'b', category: 'imported-new', amount: -2, source: 'monefy' },
    ]);
    const cats = getEntries(db)
      .map((r) => r.category)
      .sort();
    expect(cats).toEqual(['hand-entered', 'imported-new']); // old monefy gone, manual kept, new added
  });

  it('with no rows, clears monefy rows but leaves manual ones', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2020-01-01', account: 'a', category: 'imported', amount: -1, source: 'monefy' },
      { date: '2026-07-01', account: 'me', category: 'manual', amount: -9, source: 'manual' },
    ]);
    replaceEntries(db, []);
    expect(getEntries(db).map((r) => r.category)).toEqual(['manual']);
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

describe('single-row write queries', () => {
  it('inserts, then reads the row back by id (including time + currency)', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    insertEntry(db, {
      date: '2026-07-06',
      time: '08:15',
      account: 'cash',
      category: 'coffee',
      amount: -80,
      currency: 'THB',
      originalAmount: -80,
      note: 'morning latte',
    });
    const [row] = getEntries(db);
    const found = getEntryById(db, row.id);
    expect(found).toEqual(row);
    expect(found?.time).toBe('08:15');
    expect(found?.currency).toBe('THB');
  });

  it('returns undefined for a missing id', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    expect(getEntryById(db, 999)).toBeUndefined();
  });

  it('updates every column of an existing row', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    insertEntry(db, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = getEntries(db);
    updateEntry(db, row.id, {
      date: '2026-07-07',
      time: '09:00',
      account: 'visa',
      category: 'brunch',
      amount: -450,
      currency: 'THB',
      originalAmount: -450,
      note: 'updated',
    });
    expect(getEntryById(db, row.id)).toEqual({
      id: row.id,
      date: '2026-07-07',
      time: '09:00',
      account: 'visa',
      category: 'brunch',
      amount: -450,
      currency: 'THB',
      originalAmount: -450,
      note: 'updated',
      source: 'manual',
    });
  });

  it('deletes a row by id', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    insertEntry(db, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = getEntries(db);
    deleteEntry(db, row.id);
    expect(getEntries(db)).toHaveLength(0);
  });
});

describe('getDistinctCategories / getDistinctAccounts', () => {
  it('returns sorted, de-duplicated lists', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-02', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'visa', category: 'travel', amount: -1 },
    ]);
    expect(getDistinctCategories(db)).toEqual(['food', 'travel']);
    expect(getDistinctAccounts(db)).toEqual(['cash', 'visa']);
  });
});
