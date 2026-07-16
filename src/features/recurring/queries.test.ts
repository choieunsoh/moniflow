import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureRecurrencesTable, recurrences, type NewRecurrence } from './schema';
import {
  listRules,
  getRule,
  addRule,
  updateRule,
  archiveRule,
  markPosted,
  rewindRecurrences,
  postRecurringEntries,
} from './queries';

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
