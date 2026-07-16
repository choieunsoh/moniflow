import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { addRule } from '@features/recurring/queries';
import {
  addEntries,
  getEntries,
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
import { addAccount, accountIdFor } from '@features/accounts/queries';
import { setBudget, getBudgets } from '@features/budgets/queries';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d); // also bootstraps the categories + accounts tables
  await ensureBudgetsTable(d); // needed: renameCategory's merge path deletes budgets rows
  await ensureRecurrencesTable(d); // needed: delete-guard tests point a rule at a category/account
  return d;
}

describe('entries read rows carry the joined category name', () => {
  it('addEntries resolves the name to an id; reads project the name back', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 },
    ]);
    const [row] = await getEntries(d);
    expect(row.category).toBe('groceries');
    expect(typeof row.categoryId).toBe('number');
  });
});

describe('restoreEntries', () => {
  it('clears every entry (both sources) then inserts the backup set', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2020-01-01', account: 'a', category: 'old-monefy', amount: -1, source: 'monefy' },
      { date: '2026-07-01', account: 'me', category: 'old-manual', amount: -9, source: 'manual' },
    ]);
    await restoreEntries(d, [
      { date: '2026-07-10', account: 'cash', category: 'restored', amount: -5, source: 'monefy' },
    ]);
    const rows = await getEntries(d);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('restored');
  });

  it('leaves budgets intact (a ledger restore is not a wipe)', async () => {
    const d = await db();
    await addCategory(d, 'food');
    await setBudget(d, 'food', 1000);
    await restoreEntries(d, [{ date: '2026-07-10', account: 'cash', category: 'x', amount: -5 }]);
    expect(await getBudgets(d)).toHaveLength(1);
  });

  it('inserts nothing but still clears when given an empty set', async () => {
    const d = await db();
    await addEntries(d, [{ date: '2026-07-01', account: 'me', category: 'gone', amount: -9 }]);
    await restoreEntries(d, []);
    expect(await getEntries(d)).toHaveLength(0);
  });

  // 5000 rows × 7 bound columns = 35,000 params — over SQLite's 32,766 variable cap, so a
  // single-batch insert (the pre-fix bug) throws "too many SQL variables". The size is deliberate:
  // reverting the chunking must fail this test, and a smaller set would pass either way and guard
  // nothing. restoreEntries loads a full multi-year history, so it's the path that needs the guard.
  it('inserts a set larger than the SQLite variable cap in one call', async () => {
    const d = await db();
    const many = Array.from({ length: 5000 }, () => ({
      date: '2026-07-01',
      account: 'visa',
      category: 'food',
      amount: -1,
      currency: 'THB',
      originalAmount: -1,
      note: null,
    }));
    await restoreEntries(d, many);
    expect(await getEntries(d)).toHaveLength(5000);
  });
});

describe('cycle-scoped queries', () => {
  async function seed() {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-17', account: 'visa', category: 'food', amount: -100 }, // before cycle
      { date: '2026-07-18', account: 'visa', category: 'food', amount: -200 },
      { date: '2026-07-20', account: 'cash', category: 'food', amount: -50 },
      { date: '2026-08-01', account: 'visa', category: 'travel', amount: -300 },
      { date: '2026-08-18', account: 'visa', category: 'food', amount: -999 }, // next cycle
    ]);
    return d;
  }

  it('summarizes only rows within [start, end]', async () => {
    const s = await getCycleSummary(await seed(), '2026-07-18', '2026-08-17');
    expect(s).toEqual({ net: -550, inflow: 0, outflow: -550, count: 3 });
  });

  it('breaks down by category, largest magnitude first', async () => {
    const b = await getCategoryBreakdown(await seed(), '2026-07-18', '2026-08-17');
    expect(b).toEqual([
      { key: 'travel', total: -300, count: 1 },
      { key: 'food', total: -250, count: 2 }, // two in-cycle food rows (visa -200, cash -50)
    ]);
  });

  it('returns the raw entries in range', async () => {
    expect(await getEntriesInRange(await seed(), '2026-07-18', '2026-08-17')).toHaveLength(3);
  });
});

describe('single-row write queries', () => {
  it('inserts, then reads the row back by id (including time + currency)', async () => {
    const d = await db();
    await insertEntry(d, {
      date: '2026-07-06',
      time: '08:15',
      account: 'cash',
      category: 'coffee',
      amount: -80,
      currency: 'THB',
      originalAmount: -80,
      note: 'morning latte',
    });
    const [row] = await getEntries(d);
    const found = await getEntryById(d, row.id);
    expect(found).toEqual(row);
    expect(found?.time).toBe('08:15');
    expect(found?.currency).toBe('THB');
  });

  it('returns undefined for a missing id', async () => {
    const d = await db();
    expect(await getEntryById(d, 999)).toBeUndefined();
  });

  it('updates every column of an existing row', async () => {
    const d = await db();
    await insertEntry(d, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = await getEntries(d);
    await updateEntry(d, row.id, {
      date: '2026-07-07',
      time: '09:00',
      account: 'visa',
      category: 'brunch',
      amount: -450,
      currency: 'THB',
      originalAmount: -450,
      note: 'updated',
    });
    const updated = await getEntryById(d, row.id);
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

  it('deletes a row by id', async () => {
    const d = await db();
    await insertEntry(d, { date: '2026-07-06', account: 'cash', category: 'coffee', amount: -80 });
    const [row] = await getEntries(d);
    await deleteEntry(d, row.id);
    expect(await getEntries(d)).toHaveLength(0);
  });
});

describe('getDistinctCategories / getDistinctAccounts', () => {
  it('returns sorted, de-duplicated lists', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-02', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'visa', category: 'travel', amount: -1 },
    ]);
    expect(await getDistinctCategories(d)).toEqual(['food', 'travel']);
    expect(await getDistinctAccounts(d)).toEqual(['cash', 'visa']);
  });
});

describe('getAccountsByUsage', () => {
  it('orders accounts by entry count, most-used first', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-02', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-04', account: 'visa', category: 'food', amount: -1 },
      { date: '2026-07-05', account: 'cash', category: 'food', amount: -1 },
      { date: '2026-07-06', account: 'bank', category: 'food', amount: -1 },
    ]);
    expect(await getAccountsByUsage(d)).toEqual(['visa', 'cash', 'bank']);
  });
});

describe('getLatestAccount', () => {
  it('returns the account of the most recent entry', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'old', category: 'food', amount: -1 },
      { date: '2026-07-05', account: 'latest', category: 'food', amount: -1 },
      { date: '2026-07-03', account: 'mid', category: 'food', amount: -1 },
    ]);
    expect(await getLatestAccount(d)).toBe('latest');
  });

  it('returns undefined for an empty ledger', async () => {
    expect(await getLatestAccount(await db())).toBeUndefined();
  });
});

describe('getCategoryBreakdown', () => {
  it('groups expenses by category name via the join', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'groceries', amount: -50 },
      { date: '2026-07-03', account: 'bank', category: 'rent', amount: -900 },
    ]);
    expect(await getCategoryBreakdown(d, '2026-07-01', '2026-07-31')).toEqual([
      { key: 'rent', total: -900, count: 1 },
      { key: 'groceries', total: -150, count: 2 },
    ]);
  });
});

describe('getCategoryCounts', () => {
  it('groups by category and counts rows, largest count first', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง', amount: -50 },
      { date: '2026-07-03', account: 'a', category: 'อาหาร', amount: -30 },
    ]);
    expect(await getCategoryCounts(d)).toEqual([
      { category: 'ช็อปปิ้ง', count: 2 },
      { category: 'อาหาร', count: 1 },
    ]);
  });

  it('returns an empty array for an empty ledger', async () => {
    const d = await db();
    expect(await getCategoryCounts(d)).toEqual([]);
  });
});

describe('getCategoryCounts includes empty categories', () => {
  it('shows a category with no entries at count 0', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'empty-cat', '🏷️'); // creates a category row with zero entries
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 },
    ]);
    const counts = await getCategoryCounts(d);
    expect(counts).toContainEqual({ category: 'groceries', count: 1 });
    expect(counts).toContainEqual({ category: 'empty-cat', count: 0 });
  });
});

describe('getDistinctCategories lists all categories (including empty)', () => {
  it('returns names from the categories table, ordered', async () => {
    const d = await db();
    await categoryIdFor(d, 'rent');
    await categoryIdFor(d, 'groceries');
    expect(await getDistinctCategories(d)).toEqual(['groceries', 'rent']);
  });
});

describe('deleteCategory', () => {
  it('removes an empty category', async () => {
    const d = await db();
    await addCategory(d, 'Snacks');
    await deleteCategory(d, 'Snacks');
    expect(await getCategoryCounts(d)).toEqual([]);
  });

  it('is a no-op when the category still has entries (lossless — never orphan a ledger row)', async () => {
    const d = await db();
    await addEntries(d, [{ date: '2026-07-01', account: 'cash', category: 'Food', amount: -100 }]);
    await deleteCategory(d, 'Food');
    expect(await getCategoryCounts(d)).toEqual([{ category: 'Food', count: 1 }]);
  });

  it("drops the empty category's leftover budget along with it", async () => {
    const d = await db();
    await addCategory(d, 'Snacks');
    await setBudget(d, 'Snacks', 500);
    await deleteCategory(d, 'Snacks');
    expect(await getCategoryCounts(d)).toEqual([]);
    expect((await getBudgets(d)).filter((b) => b.category !== null)).toEqual([]);
  });

  it('is a no-op when the name does not exist', async () => {
    const d = await db();
    await addCategory(d, 'Snacks');
    await deleteCategory(d, 'Nope');
    expect(await getCategoryCounts(d)).toEqual([{ category: 'Snacks', count: 0 }]);
  });
});

describe('renameCategory', () => {
  it('renames every row in a category to a brand-new name', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -50 },
    ]);
    await renameCategory(d, 'ช็อปปิ้ง ชมพู่', 'ช็อปปิ้ง');
    expect(await getCategoryCounts(d)).toEqual([{ category: 'ช็อปปิ้ง', count: 2 }]);
  });

  it('merges into an existing target category — counts sum, source disappears', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'เยน ชอปปิ้ง', amount: -230 },
      { date: '2026-07-03', account: 'a', category: 'เยน ชอปปิ้ง', amount: -20 },
    ]);
    await renameCategory(d, 'เยน ชอปปิ้ง', 'ช็อปปิ้ง');
    expect(await getCategoryCounts(d)).toEqual([{ category: 'ช็อปปิ้ง', count: 3 }]);
  });

  it('is a no-op when the source category does not exist', async () => {
    const d = await db();
    await addEntries(d, [{ date: '2026-07-01', account: 'a', category: 'อาหาร', amount: -100 }]);
    await renameCategory(d, 'ไม่มีอยู่จริง', 'อาหาร');
    expect(await getCategoryCounts(d)).toEqual([{ category: 'อาหาร', count: 1 }]);
  });

  it('pure rename keeps the same id and its emoji/hue', async () => {
    const d = await db();
    await setCategoryEmoji(d, 'grocery', '🛒');
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'grocery', amount: -100 },
    ]);
    const idBefore = (await getEntries(d))[0].categoryId;
    await renameCategory(d, 'grocery', 'groceries');
    const row = (await getEntries(d))[0];
    expect(row.category).toBe('groceries');
    expect(row.categoryId).toBe(idBefore); // same identity — no entry rewrite
    expect(await getDistinctCategories(d)).toEqual(['groceries']);
  });

  it('merges into an existing target: entries move, source category is deleted', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'dining', amount: -50 },
    ]);
    const target = (await getEntries(d)).find((r) => r.category === 'dining')?.categoryId;
    await renameCategory(d, 'food', 'dining');
    const rows = await getEntries(d);
    expect(rows.every((r) => r.category === 'dining')).toBe(true);
    expect(rows.every((r) => r.categoryId === target)).toBe(true);
    expect(await getDistinctCategories(d)).toEqual(['dining']); // 'food' gone
  });

  it('merge moves the source budget to the target when the target has none', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'dining', amount: -50 },
    ]);
    await setBudget(d, 'food', 3000); // only the source has a cap
    await renameCategory(d, 'food', 'dining');
    const perCategory = (await getBudgets(d)).filter((b) => b.category !== null);
    expect(perCategory).toHaveLength(1);
    expect(perCategory[0].category).toBe('dining');
    expect(perCategory[0].amount).toBe(3000); // cap preserved, not silently lost
  });

  it("merge keeps the target's own budget and drops the source's (no duplicate)", async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'food', amount: -100 },
      { date: '2026-07-02', account: 'cash', category: 'dining', amount: -50 },
    ]);
    await setBudget(d, 'food', 3000);
    await setBudget(d, 'dining', 5000); // both have caps — target wins
    await renameCategory(d, 'food', 'dining');
    const perCategory = (await getBudgets(d)).filter((b) => b.category !== null);
    expect(perCategory).toHaveLength(1); // exactly one row for the target, source's dropped
    expect(perCategory[0].category).toBe('dining');
    expect(perCategory[0].amount).toBe(5000); // target keeps its own amount
  });
});

describe('searchEntries', () => {
  async function seed() {
    const d = await db();
    await addEntries(d, [
      { date: '2026-03-03', account: 'Cash', category: 'Running shoes', amount: -1200 },
      { date: '2026-07-08', account: 'Kasikorn', category: 'Shoes', amount: -1990 },
      { date: '2026-07-08', time: '20:00', account: 'Cash', category: 'Food', amount: -60, note: 'shoe polish' }, // prettier-ignore
      { date: '2026-07-09', account: 'Kasikorn', category: 'Salary', amount: 50000 }, // income, excluded
      { date: '2026-07-10', account: 'Cash', category: 'Coffee', amount: -80 }, // no match
    ]);
    return d;
  }

  it('matches case-insensitively across category, account, and note, newest first', async () => {
    const rows = await searchEntries(await seed(), 'shoe');
    // 2026-07-08 has two matches (Shoes category, "shoe polish" note); the timed one sorts first.
    expect(rows.map((r) => [r.date, r.category])).toEqual([
      ['2026-07-08', 'Food'], // note "shoe polish", time 20:00 → first within the day
      ['2026-07-08', 'Shoes'],
      ['2026-03-03', 'Running shoes'],
    ]);
  });

  it('matches on account name', async () => {
    expect((await searchEntries(await seed(), 'kasikorn')).map((r) => r.category)).toEqual([
      'Shoes',
    ]); // income row excluded
  });

  it('excludes income and returns nothing for a blank query', async () => {
    const d = await seed();
    expect(await searchEntries(d, 'salary')).toHaveLength(0); // salary is income
    expect(await searchEntries(d, '   ')).toHaveLength(0);
  });

  it('treats LIKE wildcards as literal text', async () => {
    // '_' must not behave as "any single char" — otherwise it would match every row.
    expect(await searchEntries(await seed(), '_')).toHaveLength(0);
  });

  it('matches the joined category name (finds an entry by a substring of its category)', async () => {
    const d = await db();
    await addEntries(d, [
      { date: '2026-07-01', account: 'cash', category: 'groceries', amount: -100 },
    ]);
    expect(await searchEntries(d, 'groc')).toHaveLength(1);
    expect((await searchEntries(d, 'groc'))[0].category).toBe('groceries');
  });
});

describe('getForeignEntries', () => {
  it('returns only non-THB rows, ordered by date then id', async () => {
    const d = await db();
    await addEntries(d, [
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
    const rows = await getForeignEntries(d);
    expect(rows).toHaveLength(2);
    expect(rows[0].category).toBe('transport'); // 03-01, sorts before the 03-02 row
    expect(rows[1].category).toBe('food');
  });

  it('excludes rows whose currency is explicitly THB', async () => {
    const d = await db();
    await addEntries(d, [
      {
        date: '2020-01-01',
        account: 'cash',
        category: 'food',
        amount: -50,
        currency: 'THB',
        originalAmount: -50,
      },
    ]);
    expect(await getForeignEntries(d)).toHaveLength(0);
  });
});

async function ledger() {
  const d = makeNodeProxyDb();
  await ensureCategoriesTable(d);
  await ensureAccountsTable(d);
  await ensureEntriesTable(d);
  await ensureRecurrencesTable(d); // needed: deleteAccount now also guards against recurrences
  await addEntries(d, [
    { date: '2026-07-01', account: 'Cash', category: 'food', amount: -100 },
    { date: '2026-07-02', account: 'Cash', category: 'food', amount: -50 },
    { date: '2026-07-03', account: 'Bank', category: 'rent', amount: -9000 },
  ]);
  return d;
}

describe('entries ↔ accounts', () => {
  it('getEntries projects the joined account name', async () => {
    const d = await ledger();
    const rows = await getEntries(d);
    expect(rows.map((r) => r.account).sort()).toEqual(['Bank', 'Cash', 'Cash']);
  });

  it('getDistinctAccounts reads the accounts table (incl. accounts with no entries)', async () => {
    const d = await ledger();
    expect(await getDistinctAccounts(d)).toEqual(['Bank', 'Cash']);
  });

  it('getAccountsByUsage orders by usage count', async () => {
    const d = await ledger();
    expect(await getAccountsByUsage(d)).toEqual(['Cash', 'Bank']);
  });

  it('getLatestAccount returns the most recent entry account', async () => {
    const d = await ledger();
    expect(await getLatestAccount(d)).toBe('Bank');
  });

  it('getAccountCounts left-joins so a zero-entry account still shows', async () => {
    const d = await ledger();
    await addAccount(d, 'Empty');
    const counts = await getAccountCounts(d);
    expect(counts.find((c) => c.account === 'Cash')?.count).toBe(2);
    expect(counts.find((c) => c.account === 'Bank')?.count).toBe(1);
    expect(counts.find((c) => c.account === 'Empty')?.count).toBe(0);
  });

  it('getAccountBreakdown sums expenses per account, sorted by magnitude', async () => {
    const d = await ledger();
    const bd = await getAccountBreakdown(d, '2026-07-01', '2026-07-31');
    expect(bd[0]).toMatchObject({ key: 'Bank', total: -9000, count: 1 });
    expect(bd[1]).toMatchObject({ key: 'Cash', total: -150, count: 2 });
  });

  it('renameAccount renames in place (same id, entries untouched)', async () => {
    const d = await ledger();
    await renameAccount(d, 'Cash', 'Wallet');
    expect(await getDistinctAccounts(d)).toEqual(['Bank', 'Wallet']);
    expect((await getEntries(d)).filter((r) => r.account === 'Wallet')).toHaveLength(2);
  });

  it('renameAccount MERGES when the target exists (reassigns then deletes source)', async () => {
    const d = await ledger();
    await renameAccount(d, 'Cash', 'Bank');
    expect(await getDistinctAccounts(d)).toEqual(['Bank']);
    expect((await getEntries(d)).every((r) => r.account === 'Bank')).toBe(true);
  });

  it('deleteAccount only removes an account with zero entries', async () => {
    const d = await ledger();
    await deleteAccount(d, 'Cash'); // has entries → no-op
    expect(await getDistinctAccounts(d)).toContain('Cash');
    await addAccount(d, 'Empty');
    await deleteAccount(d, 'Empty');
    expect(await getDistinctAccounts(d)).not.toContain('Empty');
  });

  it('mergeAccountInto is a no-op with an empty snapshot when from===to or target missing', async () => {
    const db = await ledger();
    expect((await mergeAccountInto(db, 'Cash', 'Cash')).movedIds).toEqual([]);
    expect((await mergeAccountInto(db, 'Cash', 'Nope')).movedIds).toEqual([]);
    expect(await getDistinctAccounts(db)).toEqual(['Bank', 'Cash']); // unchanged
  });

  it('mergeAccountInto returns a snapshot and undoMergeAccount restores it', async () => {
    const d = await ledger();
    const snap = await mergeAccountInto(d, 'Cash', 'Bank');
    expect(snap.source.name).toBe('Cash');
    expect(snap.movedIds).toHaveLength(2);
    expect(await getDistinctAccounts(d)).toEqual(['Bank']);

    await undoMergeAccount(d, snap);
    expect(await getDistinctAccounts(d)).toEqual(['Bank', 'Cash']);
    expect((await getEntries(d)).filter((r) => r.account === 'Cash')).toHaveLength(2);
  });
});

describe('delete guards protect recurring rules', () => {
  it('refuses to delete a category a rule points at, even with zero entries', async () => {
    const d = await db();
    const categoryId = await categoryIdFor(d, 'subscriptions');
    await addRule(d, {
      name: 'Netflix',
      day: 5,
      intervalMonths: 1,
      accountId: 1,
      categoryId,
      amount: 9.99,
      currency: 'USD',
      startDate: '2026-07-05',
    });
    await deleteCategory(d, 'subscriptions');
    expect(await getDistinctCategories(d)).toContain('subscriptions');
  });

  it('refuses to delete an account a rule points at, even with zero entries', async () => {
    const d = await db();
    const accountId = await accountIdFor(d, 'visa');
    await addRule(d, {
      name: 'Netflix',
      day: 5,
      intervalMonths: 1,
      accountId,
      categoryId: 1,
      amount: 9.99,
      currency: 'USD',
      startDate: '2026-07-05',
    });
    await deleteAccount(d, 'visa');
    expect(await getDistinctAccounts(d)).toContain('visa');
  });

  it('still deletes a category no rule and no entry references', async () => {
    const d = await db();
    await categoryIdFor(d, 'unused');
    await deleteCategory(d, 'unused');
    expect(await getDistinctCategories(d)).not.toContain('unused');
  });
});
