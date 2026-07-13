import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import {
  addEntries,
  getEntries,
  replaceEntries,
  restoreEntries,
  getCycleSummary,
  getCategoryBreakdown,
  getEntriesInRange,
  insertEntry,
  updateEntry,
  deleteEntry,
  getEntryById,
  getDistinctCategories,
  getDistinctAccounts,
  getAccountsByUsage,
  getLatestAccount,
  getCategoryCounts,
  renameCategory,
  deleteCategory,
  getForeignEntries,
  searchEntries,
  getAccountCounts,
  getAccountBreakdown,
  renameAccount,
  deleteAccount,
  mergeAccountInto,
  undoMergeAccount,
} from './queries';
import { categoryIdFor, setCategoryEmoji, addCategory } from '@features/categories/queries';
import { addAccount } from '@features/accounts/queries';
import { setBudget, getBudgets } from '@features/budgets/queries';

function db() {
  const d = initDb(':memory:');
  ensureEntriesTable(d); // also bootstraps the categories table via migrateCategoryIds
  ensureBudgetsTable(d); // needed: renameCategory's merge path deletes budgets rows
  return d;
}

describe('entries read rows carry the joined category name', () => {
  it('addEntries resolves the name to an id; reads project the name back', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 }]);
    const [row] = getEntries(d);
    expect(row.category).toBe('groceries');
    expect(typeof row.categoryId).toBe('number');
  });
});

describe('replaceEntries', () => {
  it('replaces monefy-sourced rows but keeps hand-entered (manual) ones', () => {
    const d = db();
    addEntries(d, [
      { date: '2020-01-01', account: 'a', category: 'imported-old', amount: -1, source: 'monefy' },
      { date: '2026-07-01', account: 'me', category: 'hand-entered', amount: -9, source: 'manual' },
    ]);
    replaceEntries(d, [
      { date: '2026-07-02', account: 'b', category: 'imported-new', amount: -2, source: 'monefy' },
    ]);
    const cats = getEntries(d)
      .map((r) => r.category)
      .sort();
    expect(cats).toEqual(['hand-entered', 'imported-new']); // old monefy gone, manual kept, new added
  });

  it('with no rows, clears monefy rows but leaves manual ones', () => {
    const d = db();
    addEntries(d, [
      { date: '2020-01-01', account: 'a', category: 'imported', amount: -1, source: 'monefy' },
      { date: '2026-07-01', account: 'me', category: 'manual', amount: -9, source: 'manual' },
    ]);
    replaceEntries(d, []);
    expect(getEntries(d).map((r) => r.category)).toEqual(['manual']);
  });

  // 5000 rows × 7 bound columns = 35,000 params — over SQLite's 32,766 variable cap. This size is
  // deliberate: a single-batch insert (the pre-fix bug) throws "too many SQL variables" here, so
  // reverting the chunking would fail this test. A smaller set would pass either way and guard
  // nothing.
  it('inserts a set larger than the SQLite variable cap in one call', () => {
    const d = db();
    const many = Array.from({ length: 5000 }, () => ({
      date: '2026-07-01',
      account: 'visa',
      category: 'food',
      amount: -1,
      currency: 'THB',
      originalAmount: -1,
      note: null,
    }));
    replaceEntries(d, many);
    expect(getEntries(d)).toHaveLength(5000);
  });
});

describe('restoreEntries', () => {
  it('clears every entry (both sources) then inserts the backup set', () => {
    const d = db();
    addEntries(d, [
      { date: '2020-01-01', account: 'a', category: 'old-monefy', amount: -1, source: 'monefy' },
      { date: '2026-07-01', account: 'me', category: 'old-manual', amount: -9, source: 'manual' },
    ]);
    restoreEntries(d, [
      { date: '2026-07-10', account: 'cash', category: 'restored', amount: -5, source: 'monefy' },
    ]);
    const rows = getEntries(d);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('restored');
  });

  it('leaves budgets intact (a ledger restore is not a wipe)', () => {
    const d = db();
    addCategory(d, 'food');
    setBudget(d, 'food', 1000);
    restoreEntries(d, [{ date: '2026-07-10', account: 'cash', category: 'x', amount: -5 }]);
    expect(getBudgets(d)).toHaveLength(1);
  });

  it('inserts nothing but still clears when given an empty set', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'me', category: 'gone', amount: -9 }]);
    restoreEntries(d, []);
    expect(getEntries(d)).toHaveLength(0);
  });

  // Mirrors replaceEntries' large-batch guard: 5000 rows × bound columns exceeds SQLite's 32,766
  // variable cap, so a single-batch insert throws "too many SQL variables". restoreEntries is the
  // path most likely to load a full multi-year history, so its chunking gets the same guard.
  it('inserts a set larger than the SQLite variable cap in one call', () => {
    const d = db();
    const many = Array.from({ length: 5000 }, () => ({
      date: '2026-07-01',
      account: 'visa',
      category: 'food',
      amount: -1,
      currency: 'THB',
      originalAmount: -1,
      note: null,
    }));
    restoreEntries(d, many);
    expect(getEntries(d)).toHaveLength(5000);
  });
});

describe('cycle-scoped queries', () => {
  function seed() {
    const d = db();
    addEntries(d, [
      { date: '2026-07-17', account: 'visa', category: 'food', amount: -100 }, // before cycle
      { date: '2026-07-18', account: 'visa', category: 'food', amount: -200 },
      { date: '2026-07-20', account: 'cash', category: 'food', amount: -50 },
      { date: '2026-08-01', account: 'visa', category: 'travel', amount: -300 },
      { date: '2026-08-18', account: 'visa', category: 'food', amount: -999 }, // next cycle
    ]);
    return d;
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
    const d = db();
    insertEntry(d, {
      date: '2026-07-06',
      time: '08:15',
      account: 'cash',
      category: 'coffee',
      amount: -80,
      currency: 'THB',
      originalAmount: -80,
      note: 'morning latte',
    });
    const [row] = getEntries(d);
    const found = getEntryById(d, row.id);
    expect(found).toEqual(row);
    expect(found?.time).toBe('08:15');
    expect(found?.currency).toBe('THB');
  });

  it('returns undefined for a missing id', () => {
    const d = db();
    expect(getEntryById(d, 999)).toBeUndefined();
  });

  it('updates every column of an existing row', () => {
    const d = db();
    insertEntry(d, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = getEntries(d);
    updateEntry(d, row.id, {
      date: '2026-07-07',
      time: '09:00',
      account: 'visa',
      category: 'brunch',
      amount: -450,
      currency: 'THB',
      originalAmount: -450,
      note: 'updated',
    });
    const updated = getEntryById(d, row.id);
    expect(updated?.date).toBe('2026-07-07');
    expect(updated?.time).toBe('09:00');
    expect(updated?.account).toBe('visa');
    expect(updated?.category).toBe('brunch');
    expect(updated?.amount).toBe(-450);
    expect(updated?.currency).toBe('THB');
    expect(updated?.originalAmount).toBe(-450);
    expect(updated?.note).toBe('updated');
    expect(updated?.source).toBe('manual');
  });

  it('deletes a row by id', () => {
    const d = db();
    insertEntry(d, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = getEntries(d);
    deleteEntry(d, row.id);
    expect(getEntries(d)).toHaveLength(0);
  });
});

describe('getDistinctCategories / getDistinctAccounts', () => {
  it('returns sorted, de-duplicated lists', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-02', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'visa', category: 'travel', amount: -1 },
    ]);
    expect(getDistinctCategories(d)).toEqual(['food', 'travel']);
    expect(getDistinctAccounts(d)).toEqual(['cash', 'visa']);
  });
});

describe('getAccountsByUsage', () => {
  it('orders accounts by entry count, most-used first', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-02', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-04', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-05', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-06', account: 'bank', category: 'food', amount: -1 },
    ]);
    expect(getAccountsByUsage(d)).toEqual(['visa', 'cash', 'bank']);
  });
});

describe('getLatestAccount', () => {
  it('returns the account of the most recent entry', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'old', category: 'food', amount: -1 },
      { date: '2026-07-05', account: 'latest', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'mid', category: 'food', amount: -1 },
    ]);
    expect(getLatestAccount(d)).toBe('latest');
  });

  it('returns undefined for an empty ledger', () => {
    expect(getLatestAccount(db())).toBeUndefined();
  });
});

describe('getCategoryBreakdown', () => {
  it('groups expenses by category name via the join', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'groceries', amount: -50 },
      { date: '2026-07-03', account: 'bank', category: 'rent', amount: -900 },
    ]);
    expect(getCategoryBreakdown(d, '2026-07-01', '2026-07-31')).toEqual([
      { key: 'rent', total: -900, count: 1 },
      { key: 'groceries', total: -150, count: 2 },
    ]);
  });
});

describe('getCategoryCounts', () => {
  it('groups by category and counts rows, largest count first', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง', amount: -50 },
      { date: '2026-07-03', account: 'a', category: 'อาหาร', amount: -30 },
    ]);
    expect(getCategoryCounts(d)).toEqual([
      { category: 'ช็อปปิ้ง', count: 2 },
      { category: 'อาหาร', count: 1 },
    ]);
  });

  it('returns an empty array for an empty ledger', () => {
    const d = db();
    expect(getCategoryCounts(d)).toEqual([]);
  });
});

describe('getCategoryCounts includes empty categories', () => {
  it('shows a category with no entries at count 0', () => {
    const d = db();
    setCategoryEmoji(d, 'empty-cat', '🏷️'); // creates a category row with zero entries
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 }]);
    const counts = getCategoryCounts(d);
    expect(counts).toContainEqual({ category: 'groceries', count: 1 });
    expect(counts).toContainEqual({ category: 'empty-cat', count: 0 });
  });
});

describe('getDistinctCategories lists all categories (including empty)', () => {
  it('returns names from the categories table, ordered', () => {
    const d = db();
    categoryIdFor(d, 'rent');
    categoryIdFor(d, 'groceries');
    expect(getDistinctCategories(d)).toEqual(['groceries', 'rent']);
  });
});

describe('deleteCategory', () => {
  it('removes an empty category', () => {
    const d = db();
    addCategory(d, 'Snacks');
    deleteCategory(d, 'Snacks');
    expect(getCategoryCounts(d)).toEqual([]);
  });

  it('is a no-op when the category still has entries (lossless — never orphan a ledger row)', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'Food', amount: -100 }]);
    deleteCategory(d, 'Food');
    expect(getCategoryCounts(d)).toEqual([{ category: 'Food', count: 1 }]);
  });

  it("drops the empty category's leftover budget along with it", () => {
    const d = db();
    addCategory(d, 'Snacks');
    setBudget(d, 'Snacks', 500);
    deleteCategory(d, 'Snacks');
    expect(getCategoryCounts(d)).toEqual([]);
    expect(getBudgets(d).filter((b) => b.category !== null)).toEqual([]);
  });

  it('is a no-op when the name does not exist', () => {
    const d = db();
    addCategory(d, 'Snacks');
    deleteCategory(d, 'Nope');
    expect(getCategoryCounts(d)).toEqual([{ category: 'Snacks', count: 0 }]);
  });
});

describe('renameCategory', () => {
  it('renames every row in a category to a brand-new name', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -50 },
    ]);
    renameCategory(d, 'ช็อปปิ้ง ชมพู่', 'ช็อปปิ้ง');
    expect(getCategoryCounts(d)).toEqual([{ category: 'ช็อปปิ้ง', count: 2 }]);
  });

  it('merges into an existing target category — counts sum, source disappears', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'เยน ชอปปิ้ง', amount: -230 },
      { date: '2026-07-03', account: 'a', category: 'เยน ชอปปิ้ง', amount: -20 },
    ]);
    renameCategory(d, 'เยน ชอปปิ้ง', 'ช็อปปิ้ง');
    expect(getCategoryCounts(d)).toEqual([{ category: 'ช็อปปิ้ง', count: 3 }]);
  });

  it('is a no-op when the source category does not exist', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'a', category: 'อาหาร', amount: -100 }]);
    renameCategory(d, 'ไม่มีอยู่จริง', 'อาหาร');
    expect(getCategoryCounts(d)).toEqual([{ category: 'อาหาร', count: 1 }]);
  });

  it('pure rename keeps the same id and its emoji/hue', () => {
    const d = db();
    setCategoryEmoji(d, 'grocery', '🛒');
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'grocery', amount: -100 }]);
    const idBefore = getEntries(d)[0].categoryId;
    renameCategory(d, 'grocery', 'groceries');
    const row = getEntries(d)[0];
    expect(row.category).toBe('groceries');
    expect(row.categoryId).toBe(idBefore); // same identity — no entry rewrite
    expect(getDistinctCategories(d)).toEqual(['groceries']);
  });

  it('merges into an existing target: entries move, source category is deleted', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'dining', amount: -50 },
    ]);
    const target = getEntries(d).find((r) => r.category === 'dining')?.categoryId;
    renameCategory(d, 'food', 'dining');
    const rows = getEntries(d);
    expect(rows.every((r) => r.category === 'dining')).toBe(true);
    expect(rows.every((r) => r.categoryId === target)).toBe(true);
    expect(getDistinctCategories(d)).toEqual(['dining']); // 'food' gone
  });

  it('merge moves the source budget to the target when the target has none', () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'dining', amount: -50 },
    ]);
    setBudget(d, 'food', 3000); // only the source has a cap
    renameCategory(d, 'food', 'dining');
    const perCategory = getBudgets(d).filter((b) => b.category !== null);
    expect(perCategory).toHaveLength(1);
    expect(perCategory[0].category).toBe('dining');
    expect(perCategory[0].amount).toBe(3000); // cap preserved, not silently lost
  });

  it("merge keeps the target's own budget and drops the source's (no duplicate)", () => {
    const d = db();
    addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'dining', amount: -50 },
    ]);
    setBudget(d, 'food', 3000);
    setBudget(d, 'dining', 5000); // both have caps — target wins
    renameCategory(d, 'food', 'dining');
    const perCategory = getBudgets(d).filter((b) => b.category !== null);
    expect(perCategory).toHaveLength(1); // exactly one row for the target, source's dropped
    expect(perCategory[0].category).toBe('dining');
    expect(perCategory[0].amount).toBe(5000); // target keeps its own amount
  });
});

describe('searchEntries', () => {
  function seed() {
    const d = db();
    addEntries(d, [
      { date: '2026-03-03', account: 'Cash', category: 'Running shoes', amount: -1200 },
      { date: '2026-07-08', account: 'Kasikorn', category: 'Shoes', amount: -1990 },
      { date: '2026-07-08', time: '20:00', account: 'Cash', category: 'Food', amount: -60, note: 'shoe polish' }, // prettier-ignore
      { date: '2026-07-09', account: 'Kasikorn', category: 'Salary', amount: 50000 }, // income, excluded
      { date: '2026-07-10', account: 'Cash', category: 'Coffee', amount: -80 }, // no match
    ]);
    return d;
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

  it('matches the joined category name (finds an entry by a substring of its category)', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 }]);
    expect(searchEntries(d, 'groc')).toHaveLength(1);
    expect(searchEntries(d, 'groc')[0].category).toBe('groceries');
  });
});

describe('getForeignEntries', () => {
  it('returns only non-THB rows, ordered by date then id', () => {
    const d = db();
    addEntries(d, [
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
    const rows = getForeignEntries(d);
    expect(rows).toHaveLength(2);
    expect(rows[0].category).toBe('transport'); // 03-01, sorts before the 03-02 row
    expect(rows[1].category).toBe('food');
  });

  it('excludes rows whose currency is explicitly THB', () => {
    const d = db();
    addEntries(d, [
      {
        date: '2020-01-01',
        account: 'cash',
        category: 'food',
        amount: -50,
        currency: 'THB',
        originalAmount: -50,
      },
    ]);
    expect(getForeignEntries(d)).toHaveLength(0);
  });
});

function ledger() {
  const d = initDb(':memory:');
  ensureCategoriesTable(d);
  ensureAccountsTable(d);
  ensureEntriesTable(d);
  addEntries(d, [
    { date: '2026-07-01', account: 'Cash', category: 'food', amount: -100 },
    { date: '2026-07-02', account: 'Cash', category: 'food', amount: -50 },
    { date: '2026-07-03', account: 'Bank', category: 'rent', amount: -9000 },
  ]);
  return d;
}

describe('entries ↔ accounts', () => {
  it('getEntries projects the joined account name', () => {
    const d = ledger();
    const rows = getEntries(d);
    expect(rows.map((r) => r.account).sort()).toEqual(['Bank', 'Cash', 'Cash']);
  });

  it('getDistinctAccounts reads the accounts table (incl. accounts with no entries)', () => {
    const d = ledger();
    expect(getDistinctAccounts(d)).toEqual(['Bank', 'Cash']);
  });

  it('getAccountsByUsage orders by usage count', () => {
    const d = ledger();
    expect(getAccountsByUsage(d)).toEqual(['Cash', 'Bank']);
  });

  it('getLatestAccount returns the most recent entry account', () => {
    const d = ledger();
    expect(getLatestAccount(d)).toBe('Bank');
  });

  it('getAccountCounts left-joins so a zero-entry account still shows', () => {
    const d = ledger();
    addAccount(d, 'Empty');
    const counts = getAccountCounts(d);
    expect(counts.find((c) => c.account === 'Cash')?.count).toBe(2);
    expect(counts.find((c) => c.account === 'Bank')?.count).toBe(1);
    expect(counts.find((c) => c.account === 'Empty')?.count).toBe(0);
  });

  it('getAccountBreakdown sums expenses per account, sorted by magnitude', () => {
    const d = ledger();
    const bd = getAccountBreakdown(d, '2026-07-01', '2026-07-31');
    expect(bd[0]).toMatchObject({ key: 'Bank', total: -9000, count: 1 });
    expect(bd[1]).toMatchObject({ key: 'Cash', total: -150, count: 2 });
  });

  it('renameAccount renames in place (same id, entries untouched)', () => {
    const d = ledger();
    renameAccount(d, 'Cash', 'Wallet');
    expect(getDistinctAccounts(d)).toEqual(['Bank', 'Wallet']);
    expect(getEntries(d).filter((r) => r.account === 'Wallet')).toHaveLength(2);
  });

  it('renameAccount MERGES when the target exists (reassigns then deletes source)', () => {
    const d = ledger();
    renameAccount(d, 'Cash', 'Bank');
    expect(getDistinctAccounts(d)).toEqual(['Bank']);
    expect(getEntries(d).every((r) => r.account === 'Bank')).toBe(true);
  });

  it('deleteAccount only removes an account with zero entries', () => {
    const d = ledger();
    deleteAccount(d, 'Cash'); // has entries → no-op
    expect(getDistinctAccounts(d)).toContain('Cash');
    addAccount(d, 'Empty');
    deleteAccount(d, 'Empty');
    expect(getDistinctAccounts(d)).not.toContain('Empty');
  });

  it('mergeAccountInto is a no-op with an empty snapshot when from===to or target missing', () => {
    const db = ledger();
    expect(mergeAccountInto(db, 'Cash', 'Cash').movedIds).toEqual([]);
    expect(mergeAccountInto(db, 'Cash', 'Nope').movedIds).toEqual([]);
    expect(getDistinctAccounts(db)).toEqual(['Bank', 'Cash']); // unchanged
  });

  it('mergeAccountInto returns a snapshot and undoMergeAccount restores it', () => {
    const d = ledger();
    const snap = mergeAccountInto(d, 'Cash', 'Bank');
    expect(snap.source.name).toBe('Cash');
    expect(snap.movedIds).toHaveLength(2);
    expect(getDistinctAccounts(d)).toEqual(['Bank']);

    undoMergeAccount(d, snap);
    expect(getDistinctAccounts(d)).toEqual(['Bank', 'Cash']);
    expect(getEntries(d).filter((r) => r.account === 'Cash')).toHaveLength(2);
  });
});
