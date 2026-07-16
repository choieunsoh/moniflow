import { describe, it, expect } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureRecurrencesTable } from './schema';
import { addRule, listRules, rewindRecurrences } from './queries';
import { runSweep } from './sweep';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d);
  await ensureRecurrencesTable(d);
  return d;
}

describe('restoring an older backup', () => {
  it('rewinds the pointer so the next sweep refills the missing months', async () => {
    const d = await db();
    await addRule(d, {
      name: 'Rent',
      day: 1,
      intervalMonths: 1,
      accountId: 1,
      categoryId: 1,
      amount: 15000,
      currency: 'THB',
      startDate: '2026-06-01',
    });

    await runSweep(d, '2026-08-20'); // posts Jun 1, Jul 1, Aug 1
    expect((await listRules(d))[0].lastPosted).toBe('2026-08-01');

    // A restore replaces the ledger with a backup whose newest row is 2026-06-20.
    await rewindRecurrences(d, '2026-06-20');
    expect((await listRules(d))[0].lastPosted).toBe('2026-06-20');

    // The next sweep refills exactly the two missing months — not June, which the CSV still holds.
    expect(await runSweep(d, '2026-08-20')).toBe(2);
    expect((await listRules(d))[0].lastPosted).toBe('2026-08-01');
  });
});
