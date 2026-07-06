import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { addEntries, getEntries, replaceEntries } from './queries';

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
