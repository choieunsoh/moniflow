import { describe, it, expect, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureCurrenciesTable } from './schema';
import {
  listCurrencies,
  listAllCurrencies,
  getTravelCurrencies,
  getCurrencyCodes,
  addCurrency,
  setCurrencyOffBudget,
  setCurrencyArchived,
} from './queries';

let db: Db;

beforeEach(async () => {
  db = makeNodeProxyDb();
  await ensureCurrenciesTable(db);
});

describe('currency catalog', () => {
  it('seeds the known currencies on first read', async () => {
    const rows = await listCurrencies(db);
    expect(rows.map((r) => r.code)).toEqual(
      expect.arrayContaining(['THB', 'JPY', 'KRW', 'HKD', 'MOP', 'USD', 'EUR', 'GBP', 'SGD']),
    );
  });

  it('seeds only once — a second read does not duplicate rows', async () => {
    const first = await listCurrencies(db);
    const second = await listCurrencies(db);
    expect(second).toHaveLength(first.length);
  });

  it('marks the travel currencies off-budget and leaves online ones on-budget', async () => {
    const travel = await getTravelCurrencies(db);
    expect(travel).toEqual(new Set(['JPY', 'KRW', 'HKD', 'MOP']));
  });

  it('pins THB first, then orders by code', async () => {
    const rows = await listCurrencies(db);
    expect(rows[0]?.code).toBe('THB');
  });

  it('adds a currency that was not seeded', async () => {
    await addCurrency(db, 'TWD');
    const codes = await getCurrencyCodes(db);
    expect(codes.has('TWD')).toBe(true);
  });

  it('adding an existing currency is a no-op, not a duplicate-key crash', async () => {
    const before = await listCurrencies(db);
    await addCurrency(db, 'JPY');
    expect(await listCurrencies(db)).toHaveLength(before.length);
  });

  it('toggles off-budget on a currency', async () => {
    await setCurrencyOffBudget(db, 'USD', true);
    expect(await getTravelCurrencies(db)).toContain('USD');
    await setCurrencyOffBudget(db, 'USD', false);
    expect(await getTravelCurrencies(db)).not.toContain('USD');
  });

  it('hides an archived currency from the picker list but keeps the row', async () => {
    await setCurrencyArchived(db, 'GBP', true);
    expect((await listCurrencies(db)).map((r) => r.code)).not.toContain('GBP');
    expect((await listAllCurrencies(db)).map((r) => r.code)).toContain('GBP');
  });
});
