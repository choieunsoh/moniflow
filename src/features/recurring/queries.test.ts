import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureRecurrencesTable, recurrences, type NewRecurrence } from './schema';
import { categoryIdFor, setCategoryEmoji, setCategoryHue } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import {
  listRules,
  getRule,
  addRule,
  updateRule,
  archiveRule,
  markPosted,
  rewindRecurrences,
  postRecurringEntries,
  listRuleMeta,
  getRuleCatalog,
  restoreRecurrencesFromCatalog,
} from './queries';
import type { RuleCatalogRow } from '@features/settings/catalog';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d);
  await ensureRecurrencesTable(d);
  return d;
}

const netflix: NewRecurrence = {
  name: 'Netflix',
  day: 5,
  intervalMonths: 1,
  accountId: 1,
  categoryId: 1,
  amount: 9.99,
  currency: 'USD',
  startDate: '2026-07-05',
};

describe('rule CRUD', () => {
  it('adds and lists a rule', async () => {
    const d = await db();
    await addRule(d, netflix);
    const rows = await listRules(d);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Netflix', day: 5, amount: 9.99 });
  });

  it('hides archived rules from the list but keeps them readable by id', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await archiveRule(d, row.id);
    expect(await listRules(d)).toEqual([]);
    expect(await getRule(d, row.id)).toMatchObject({ name: 'Netflix', archived: 1 });
  });

  it('updates a rule in place', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await updateRule(d, row.id, { amount: 12.99, rate: 36.5 });
    expect(await getRule(d, row.id)).toMatchObject({ amount: 12.99, rate: 36.5, name: 'Netflix' });
  });

  it('advances the lastPosted pointer', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await markPosted(d, row.id, '2026-09-05');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: '2026-09-05' });
  });
});

describe('rewindRecurrences', () => {
  it('clamps a pointer that ran past the backup, so the sweep refills the gap', async () => {
    const d = await db();
    await addRule(d, { ...netflix, lastPosted: '2026-07-05' });
    const [row] = await listRules(d);
    await rewindRecurrences(d, '2026-06-20');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: '2026-06-20' });
  });

  it('leaves a pointer already behind the backup alone', async () => {
    const d = await db();
    await addRule(d, { ...netflix, lastPosted: '2026-05-05' });
    const [row] = await listRules(d);
    await rewindRecurrences(d, '2026-06-20');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: '2026-05-05' });
  });

  it('leaves a never-posted rule alone', async () => {
    const d = await db();
    await addRule(d, netflix);
    const [row] = await listRules(d);
    await rewindRecurrences(d, '2026-06-20');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: null });
  });

  it('rewinds archived rules too — an archived rule can be un-archived later', async () => {
    const d = await db();
    await addRule(d, { ...netflix, lastPosted: '2026-07-05', archived: 1 });
    await rewindRecurrences(d, '2026-06-20');
    const [row] = await d.select().from(recurrences).all();
    expect(row.lastPosted).toBe('2026-06-20');
  });

  it('leaves a rule posted on exactly the backup date undisturbed', async () => {
    // That day's entry IS in the restored CSV, so it must not repost — the pointer must still
    // read maxDate afterwards. (This pins the outcome, not the predicate: gt and gte are
    // equivalent here, since clamping a row already at maxDate is a no-op.)
    const d = await db();
    await addRule(d, { ...netflix, lastPosted: '2026-06-20' });
    const [row] = await listRules(d);
    await rewindRecurrences(d, '2026-06-20');
    expect(await getRule(d, row.id)).toMatchObject({ lastPosted: '2026-06-20' });
  });
});

describe('postRecurringEntries', () => {
  it('inserts ledger rows with ids directly and tags the source', async () => {
    const d = await db();
    await postRecurringEntries(d, [
      {
        date: '2026-07-05',
        accountId: 1,
        categoryId: 2,
        amount: -364.5,
        currency: 'USD',
        originalAmount: -9.99,
        note: 'Netflix',
      },
    ]);
    const rows = await d.select().from(entries).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      date: '2026-07-05',
      accountId: 1,
      categoryId: 2,
      amount: -364.5,
      currency: 'USD',
      originalAmount: -9.99,
      note: 'Netflix',
      source: 'recurring',
    });
  });

  it('is a no-op on an empty list', async () => {
    const d = await db();
    await postRecurringEntries(d, []);
    expect(await d.select().from(entries).all()).toEqual([]);
  });
});

describe('listRuleMeta', () => {
  it("resolves a rule's categoryId/accountId to display names, emoji, and hue", async () => {
    const d = await db();
    const categoryId = await categoryIdFor(d, 'Streaming');
    await setCategoryEmoji(d, 'Streaming', '🎬');
    await setCategoryHue(d, 'Streaming', 200);
    const accountId = await accountIdFor(d, 'Visa');
    await addRule(d, { ...netflix, categoryId, accountId });

    const rows = await listRuleMeta(d);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      categoryName: 'Streaming',
      categoryEmoji: '🎬',
      categoryHue: 200,
      accountName: 'Visa',
    });
  });

  // The query leftJoins (not innerJoins) both FKs because they're nullable columns — a rule with no
  // category/account assigned yet must still show up on the /recurring page, just with blank markers.
  // An innerJoin would silently DROP such a rule from the list.
  it('still returns a rule whose categoryId/accountId is null (leftJoin, not innerJoin)', async () => {
    const d = await db();
    await addRule(d, { ...netflix, categoryId: null, accountId: null });

    const rows = await listRuleMeta(d);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      categoryName: null,
      categoryEmoji: null,
      categoryHue: null,
      accountName: null,
    });
  });

  it('excludes archived rules, matching listRules', async () => {
    const d = await db();
    await addRule(d, { ...netflix, archived: 1 });
    expect(await listRuleMeta(d)).toEqual([]);
  });
});

describe('getRuleCatalog', () => {
  it('exports active rules by name, deriving month only for yearly', async () => {
    const d = await db();
    const categoryId = await categoryIdFor(d, 'Streaming');
    const accountId = await accountIdFor(d, 'Visa');
    await addRule(d, {
      name: 'Netflix',
      day: 5,
      intervalMonths: 1,
      categoryId,
      accountId,
      amount: 9.99,
      currency: 'USD',
      startDate: '2026-07-05',
    });
    await addRule(d, {
      name: 'Domain',
      day: 5,
      intervalMonths: 12,
      categoryId,
      accountId,
      amount: 1200,
      currency: 'THB',
      startDate: '2026-03-05',
    });

    const rows = await getRuleCatalog(d);
    expect(rows).toContainEqual(
      expect.objectContaining({
        name: 'Netflix',
        category: 'Streaming',
        account: 'Visa',
        month: null,
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ name: 'Domain', intervalMonths: 12, month: 3 }),
    );
  });

  it('excludes archived rules', async () => {
    const d = await db();
    const categoryId = await categoryIdFor(d, 'Streaming');
    const accountId = await accountIdFor(d, 'Visa');
    await addRule(d, {
      name: 'Gone',
      day: 5,
      intervalMonths: 1,
      categoryId,
      accountId,
      amount: 5,
      currency: 'THB',
      startDate: '2026-07-05',
      archived: 1,
    });
    expect(await getRuleCatalog(d)).toEqual([]);
  });
});

describe('restoreRecurrencesFromCatalog', () => {
  const netflix: RuleCatalogRow = {
    name: 'Netflix',
    category: 'Streaming',
    account: 'Visa',
    amount: 9.99,
    currency: 'USD',
    rate: null,
    day: 5,
    intervalMonths: 1,
    month: null,
    totalCount: null,
  };

  it('inserts a fresh rule: pointer null, startSeq 1, startDate next occurrence, ids resolved', async () => {
    const d = await db();
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20');
    const [rule] = await listRules(d);
    expect(rule).toMatchObject({
      name: 'Netflix',
      amount: 9.99,
      currency: 'USD',
      lastPosted: null,
      startSeq: 1,
      startDate: '2026-08-05', // the 5th has passed on the 20th
    });
    // names resolved to real ids
    expect(rule.categoryId).not.toBeNull();
    expect(rule.accountId).not.toBeNull();
  });

  it('reconstructs a yearly rule startDate from its month', async () => {
    const d = await db();
    const domain: RuleCatalogRow = {
      ...netflix,
      name: 'Domain',
      intervalMonths: 12,
      month: 3,
      currency: 'THB',
    };
    await restoreRecurrencesFromCatalog(d, [domain], '2026-07-20');
    const [rule] = await listRules(d);
    expect(rule).toMatchObject({ name: 'Domain', startDate: '2027-03-05' }); // March already passed
  });

  it('is idempotent — a rule whose name exists is skipped', async () => {
    const d = await db();
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20');
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20'); // second import
    expect((await listRules(d)).filter((r) => r.name === 'Netflix')).toHaveLength(1);
  });

  it('auto-creates a missing category and account', async () => {
    const d = await db();
    await restoreRecurrencesFromCatalog(d, [netflix], '2026-07-20');
    const catId = await categoryIdFor(d, 'Streaming'); // already exists now → returns it, no dup
    const [rule] = await listRules(d);
    expect(rule.categoryId).toBe(catId);
  });
});
