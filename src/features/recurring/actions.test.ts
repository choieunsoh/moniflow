import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureRecurrencesTable, type NewRecurrence } from './schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { addRule, listRules } from './queries';
import { setCurrencyArchived } from '@features/currencies/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { editRuleAction } from './actions';

let db: Db;

beforeEach(async () => {
  db = makeNodeProxyDb();
  await ensureEntriesTable(db);
  await ensureRecurrencesTable(db);
  await ensureCurrenciesTable(db);
  vi.mocked(getBrowserDb).mockResolvedValue(db);
});

// Mirrors entries/actions.test.ts: a rule already standing in JPY must stay saveable in JPY once JPY
// is archived — write-time validation (non-archived getCurrencyCodes, unchanged) must not reject the
// rule's own currency being resubmitted unchanged, only a genuine switch to a new archived currency.
describe('editRuleAction — archived currencies', () => {
  it('keeps an existing rule saveable in its own currency after that currency is archived', async () => {
    const seed: NewRecurrence = {
      name: 'Japan SIM',
      day: 5,
      intervalMonths: 1,
      accountId: 1,
      categoryId: 1,
      amount: 1000,
      currency: 'JPY',
      startDate: '2026-07-05',
    };
    await addRule(db, seed);
    const [rule] = await listRules(db);
    await setCurrencyArchived(db, 'JPY', true);

    const fd = new FormData();
    fd.set('id', String(rule.id));
    fd.set('name', rule.name);
    fd.set('day', String(rule.day));
    fd.set('intervalMonths', String(rule.intervalMonths));
    fd.set('account', 'Wise');
    fd.set('category', 'Travel');
    fd.set('amount', String(rule.amount));
    fd.set('currency', 'JPY');

    await expect(editRuleAction(fd)).resolves.toBeUndefined();

    const [updated] = await listRules(db);
    expect(updated.currency).toBe('JPY');
  });
});
