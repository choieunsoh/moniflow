import { describe, it, expect, vi, afterEach } from 'vitest';
import { gt } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { setCardFeePct, setFxRates } from '@features/settings/queries';
import { ensureRecurrencesTable, type NewRecurrence } from './schema';
import { addRule, listRules, rewindRecurrences } from './queries';
import { runSweep } from './sweep';

async function db() {
  const d = makeNodeProxyDb();
  await ensureEntriesTable(d);
  await ensureSettingsTable(d);
  await ensureRecurrencesTable(d);
  await setCardFeePct(d, 0); // zero fee keeps the arithmetic readable in these tests
  return d;
}

const rent: NewRecurrence = {
  name: 'Rent',
  day: 1,
  intervalMonths: 1,
  accountId: 1,
  categoryId: 1,
  amount: 15000,
  currency: 'THB',
  startDate: '2026-07-01',
};

const fridge: NewRecurrence = {
  name: 'Fridge',
  day: 1,
  intervalMonths: 1,
  accountId: 1,
  categoryId: 2,
  amount: 2000,
  currency: 'THB',
  totalCount: 12,
  startSeq: 4,
  startDate: '2026-07-01',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runSweep', () => {
  it('posts nothing before the start date', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-06-30')).toBe(0);
    expect(await d.select().from(entries).all()).toEqual([]);
  });

  it('posts a due bill as a NEGATIVE entry dated the due date', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    const rows = await d.select().from(entries).all();
    expect(rows[0]).toMatchObject({
      date: '2026-07-01',
      amount: -15000,
      note: 'Rent',
      source: 'recurring',
      accountId: 1,
      categoryId: 1,
    });
  });

  it('catches up every missed month at once, dated correctly', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-09-20')).toBe(3);
    const dates = (await d.select().from(entries).all()).map((r) => r.date);
    expect(dates).toEqual(['2026-07-01', '2026-08-01', '2026-09-01']);
  });

  it('is idempotent — a second sweep the same day posts nothing', async () => {
    const d = await db();
    await addRule(d, rent);
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    expect(await runSweep(d, '2026-07-20')).toBe(0);
    expect(await d.select().from(entries).all()).toHaveLength(1);
  });

  it('advances lastPosted to the newest date posted', async () => {
    const d = await db();
    await addRule(d, rent);
    await runSweep(d, '2026-09-20');
    const [row] = await listRules(d);
    expect(row.lastPosted).toBe('2026-09-01');
  });

  it('numbers installment notes from startSeq and stops at totalCount', async () => {
    const d = await db();
    await addRule(d, fridge);
    expect(await runSweep(d, '2030-01-01')).toBe(9);
    const notes = (await d.select().from(entries).all()).map((r) => r.note);
    expect(notes[0]).toBe('Fridge (4/12)');
    expect(notes[8]).toBe('Fridge (12/12)');
  });

  it('skips archived rules', async () => {
    const d = await db();
    await addRule(d, { ...rent, archived: 1 });
    expect(await runSweep(d, '2026-07-20')).toBe(0);
  });

  it('converts an FX rule at the due date fixing', async () => {
    const d = await db();
    await addRule(d, {
      ...rent,
      name: 'Netflix',
      day: 5,
      amount: 9.99,
      currency: 'USD',
      startDate: '2026-07-05',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ base: 'THB', date: '2026-07-05', rates: { USD: 0.0275 } }), {
        status: 200,
      }),
    );
    await runSweep(d, '2026-07-20');
    // The rule is due 2026-07-05 but the sweep runs on 2026-07-20 — the fixing fetched must be the
    // due date's, not today's, or a subscription due on the 5th silently converts at today's rate.
    expect(fetchSpy.mock.calls[0][0]).toContain('/v1/2026-07-05');
    expect(fetchSpy.mock.calls[0][0]).not.toContain('2026-07-20');
    const [row] = await d.select().from(entries).all();
    expect(row.amount).toBeCloseTo(-Math.round((9.99 / 0.0275) * 100) / 100, 2);
    expect(row.originalAmount).toBe(-9.99);
    expect(row.currency).toBe('USD');
  });

  it('isolates a failing rule: the others still post and the failed one keeps its pointer', async () => {
    const d = await db();
    // The failing rule is added FIRST so listRules (ordered by id ascending) processes it first.
    // If that ordering were reversed, Rent would post and commit before Netflix ever throws, and a
    // buggy whole-loop catch (wrapping the entire `for`, not just one rule's body) would pass this
    // test identically — the isolation it's meant to prove would go untested.
    await addRule(d, { ...rent, name: 'Netflix', amount: 9.99, currency: 'USD' });
    await addRule(d, rent);
    // A foreign rule with no cached rate and no network — resolveRate throws for this one only.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    const rules = await listRules(d);
    expect(rules.find((r) => r.name === 'Rent')?.lastPosted).toBe('2026-07-01');
    expect(rules.find((r) => r.name === 'Netflix')?.lastPosted).toBeNull(); // retries next open
  });

  it('posts a failed-fetch FX rule at the cached rate rather than skipping it', async () => {
    const d = await db();
    await setFxRates(d, { USD: { thbPerUnit: 35, asOf: '2026-06-30' } });
    await addRule(d, { ...rent, name: 'Netflix', amount: 10, currency: 'USD' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await runSweep(d, '2026-07-20')).toBe(1);
    const [row] = await d.select().from(entries).all();
    expect(row.amount).toBe(-350);
  });

  it('refills the gap after a rewind, with correct seq numbers', async () => {
    const d = await db();
    await addRule(d, fridge);
    await runSweep(d, '2026-09-20'); // posts #4 (Jul), #5 (Aug), #6 (Sep)

    // Simulate a restore to a mid-July backup: the ledger loses everything after Jul 15, and
    // rewindRecurrences clamps the pointer to match.
    await d.delete(entries).where(gt(entries.date, '2026-07-15')).run();
    await rewindRecurrences(d, '2026-07-15');

    // The gap refills, and the seq numbers are still 5 and 6 — NOT restarted at 4 — because they
    // derive from the clamped pointer rather than a stored counter.
    expect(await runSweep(d, '2026-09-20')).toBe(2);
    const notes = (await d.select().from(entries).all()).map((r) => r.note);
    expect(notes).toEqual(['Fridge (4/12)', 'Fridge (5/12)', 'Fridge (6/12)']);
  });
});
