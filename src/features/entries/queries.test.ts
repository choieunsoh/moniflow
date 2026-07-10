import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import {
  addEntries,
  getEntries,
  replaceEntries,
  getCycleSummary,
  getCategoryBreakdown,
  getEntriesInRange,
  insertEntry,
  updateEntry,
  deleteEntry,
  getEntryById,
  getDistinctCategories,
  getDistinctAccounts,
  getCategoryCounts,
  renameCategory,
  getForeignEntries,
  searchEntries,
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
      { key: 'travel', total: -300, count: 1 },
      { key: 'food', total: -250, count: 2 }, // two in-cycle food rows (visa -200, cash -50)
    ]);
  });

  it('returns the raw entries in range', () => {
    expect(getEntriesInRange(seed(), '2026-07-18', '2026-08-17')).toHaveLength(3);
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

describe('getCategoryCounts', () => {
  it('groups by category and counts rows, largest count first', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง', amount: -50 },
      { date: '2026-07-03', account: 'a', category: 'อาหาร', amount: -30 },
    ]);
    expect(getCategoryCounts(db)).toEqual([
      { category: 'ช็อปปิ้ง', count: 2 },
      { category: 'อาหาร', count: 1 },
    ]);
  });

  it('returns an empty array for an empty ledger', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    expect(getCategoryCounts(db)).toEqual([]);
  });
});

describe('renameCategory', () => {
  it('renames every row in a category to a brand-new name', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -50 },
    ]);
    renameCategory(db, 'ช็อปปิ้ง ชมพู่', 'ช็อปปิ้ง');
    expect(getCategoryCounts(db)).toEqual([{ category: 'ช็อปปิ้ง', count: 2 }]);
  });

  it('merges into an existing target category — counts sum, source disappears', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'เยน ชอปปิ้ง', amount: -230 },
      { date: '2026-07-03', account: 'a', category: 'เยน ชอปปิ้ง', amount: -20 },
    ]);
    renameCategory(db, 'เยน ชอปปิ้ง', 'ช็อปปิ้ง');
    expect(getCategoryCounts(db)).toEqual([{ category: 'ช็อปปิ้ง', count: 3 }]);
  });

  it('is a no-op when the source category does not exist', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [{ date: '2026-07-01', account: 'a', category: 'อาหาร', amount: -100 }]);
    renameCategory(db, 'ไม่มีอยู่จริง', 'อาหาร');
    expect(getCategoryCounts(db)).toEqual([{ category: 'อาหาร', count: 1 }]);
  });
});

describe('searchEntries', () => {
  function seed() {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-03-03', account: 'Cash', category: 'Running shoes', amount: -1200 },
      { date: '2026-07-08', account: 'Kasikorn', category: 'Shoes', amount: -1990 },
      { date: '2026-07-08', time: '20:00', account: 'Cash', category: 'Food', amount: -60, note: 'shoe polish' }, // prettier-ignore
      { date: '2026-07-09', account: 'Kasikorn', category: 'Salary', amount: 50000 }, // income, excluded
      { date: '2026-07-10', account: 'Cash', category: 'Coffee', amount: -80 }, // no match
    ]);
    return db;
  }

  it('matches case-insensitively across category, account, and note, newest first', () => {
    const rows = searchEntries(seed(), 'shoe');
    // 2026-07-08 has two matches (Shoes category, "shoe polish" note); the timed one sorts first.
    expect(rows.map((r) => [r.date, r.category])).toEqual([
      ['2026-07-08', 'Food'], // note "shoe polish", time 20:00 → first within the day
      ['2026-07-08', 'Shoes'],
      ['2026-03-03', 'Running shoes'],
    ]);
  });

  it('matches on account name', () => {
    expect(searchEntries(seed(), 'kasikorn').map((r) => r.category)).toEqual(['Shoes']); // income row excluded
  });

  it('excludes income and returns nothing for a blank query', () => {
    expect(searchEntries(seed(), 'salary')).toHaveLength(0); // salary is income
    expect(searchEntries(seed(), '   ')).toHaveLength(0);
  });

  it('treats LIKE wildcards as literal text', () => {
    // '_' must not behave as "any single char" — otherwise it would match every row.
    expect(searchEntries(seed(), '_')).toHaveLength(0);
  });
});

describe('getForeignEntries', () => {
  it('returns only non-THB rows, ordered by date then id', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      {
        date: '2019-03-02',
        account: 'jpy',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
      },
      { date: '2019-03-01', account: 'cash', category: 'food', amount: -50 }, // THB, excluded
      {
        date: '2019-03-01',
        account: 'cash',
        category: 'misc',
        amount: -10,
        currency: null,
        originalAmount: null,
      }, // null currency, excluded
      {
        date: '2019-03-01',
        account: 'jpy',
        category: 'transport',
        amount: -100,
        currency: 'JPY',
        originalAmount: -400,
      },
    ]);
    const rows = getForeignEntries(db);
    expect(rows).toHaveLength(2);
    expect(rows[0].category).toBe('transport'); // 03-01, sorts before the 03-02 row
    expect(rows[1].category).toBe('food');
  });

  it('excludes rows whose currency is explicitly THB', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      {
        date: '2020-01-01',
        account: 'cash',
        category: 'food',
        amount: -50,
        currency: 'THB',
        originalAmount: -50,
      },
    ]);
    expect(getForeignEntries(db)).toHaveLength(0);
  });
});
