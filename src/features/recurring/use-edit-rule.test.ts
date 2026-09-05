import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { ensureEntriesTable } from '@features/entries/schema';
import { setCardFeePct, setFxRates } from '@features/settings/queries';
import { addCategory, categoryIdFor } from '@features/categories/queries';
import { addAccount, accountIdFor } from '@features/accounts/queries';
import { ensureRecurrencesTable } from './schema';
import { addRule, listRules } from './queries';
import type { NewRecurrence } from './schema';

// Same shape as use-recurring.test.ts: a REAL in-memory db, with only @db/browser mocked. Mocking
// './queries' instead would hide exactly what this hook exists to do — join a rule's stored ids back
// to the NAMES the keypad selects by.
vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useEditRule } from './use-edit-rule';

const NETFLIX: Omit<NewRecurrence, 'accountId' | 'categoryId'> = {
  name: 'Netflix',
  day: 5,
  intervalMonths: 1,
  amount: 419,
  currency: 'THB',
  startDate: '2026-07-05',
};

async function seedRule(overrides: Partial<NewRecurrence> = {}): Promise<number> {
  const db = await getBrowserDb();
  await addRule(db, {
    ...NETFLIX,
    categoryId: await categoryIdFor(db, 'Subscriptions'),
    accountId: await accountIdFor(db, 'Credit'),
    ...overrides,
  });
  const [rule] = await listRules(db);
  return rule.id;
}

beforeEach(async () => {
  const db = makeNodeProxyDb();
  await ensureRecurrencesTable(db);
  await ensureSettingsTable(db);
  await ensureCurrenciesTable(db);
  await ensureEntriesTable(db);
  await addCategory(db, 'Subscriptions');
  await addAccount(db, 'Credit');
  vi.mocked(getBrowserDb).mockResolvedValue(db);
});

describe('useEditRule', () => {
  it('starts not ready, then resolves the rule with its category and account NAMES', async () => {
    const id = await seedRule();

    const { result } = renderHook(() => useEditRule(id));
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    // The rule stores ids; the keypad selects by name. Resolving the two is this hook's whole job.
    expect(data.rule.name).toBe('Netflix');
    expect(data.category).toBe('Subscriptions');
    expect(data.account).toBe('Credit');
    expect(data.categories.map((c) => c.name)).toContain('Subscriptions');
    expect(data.accounts.map((a) => a.name)).toContain('Credit');
  });

  // The hook's only arithmetic: the cached ECB rate is a MID rate, and every figure the rule keypad
  // shows must already carry the card's FX fee. Handing the raw thbPerUnit through would under-state
  // a foreign rule by the fee on every screen that reads it.
  it('prices the FX cache fee-inclusive, not at the raw mid rate', async () => {
    const db = await getBrowserDb();
    await setCardFeePct(db, 2.5);
    await setFxRates(db, { JPY: { thbPerUnit: 0.24, asOf: '2026-07-01' } });
    const id = await seedRule({ currency: 'JPY' });

    const { result } = renderHook(() => useEditRule(id));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.rates.JPY).toBeCloseTo(0.24 * 1.025, 10);
    expect(data.rates.JPY).not.toBe(0.24);
    expect(data.ratesAsOf.JPY).toBe('2026-07-01');
  });

  // A stale/bad ?id= is a condition, not a crash: the page decides how to show "no such rule".
  it('resolves ready with data null for an id that does not exist', async () => {
    const { result } = renderHook(() => useEditRule(999999));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
