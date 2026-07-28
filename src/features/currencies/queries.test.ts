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
  getCurrencyCatalog,
  restoreCurrencyCatalog,
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

  // sortOrder is nullable and SQLite sorts NULL first under ORDER BY sortOrder ASC. Without an
  // explicit sortOrder, a newly added currency would land above THB (sortOrder 0) on the page — the
  // exact path this feature exists for. addCurrency must assign the next sort order (max + 1).
  it('sorts a newly added currency last, not first', async () => {
    await addCurrency(db, 'TWD');
    const codes = (await listCurrencies(db)).map((r) => r.code);
    expect(codes[0]).toBe('THB');
    expect(codes[codes.length - 1]).toBe('TWD');
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

describe('currency catalog backup', () => {
  it('merges a restored catalog without deleting local currencies', async () => {
    await addCurrency(db, 'TWD');
    await restoreCurrencyCatalog(db, [
      { code: 'JPY', offBudget: true, sortOrder: 1, archived: false },
      { code: 'VND', offBudget: true, sortOrder: 9, archived: false },
    ]);
    const codes = await getCurrencyCodes(db);
    expect(codes.has('TWD')).toBe(true);
    expect(codes.has('VND')).toBe(true);
    expect(await getTravelCurrencies(db)).toContain('VND');
  });

  // restoreCurrencyCatalog is a write path against a table that, on a fresh device, may never have
  // been read — the same shape as the setCurrencyOffBudget/setCurrencyArchived gotcha from Task 2.
  // Those are bare UPDATEs and no-op silently against a table with zero rows; restoreCurrencyCatalog
  // is INSERT ... ON CONFLICT DO UPDATE, which inserts unconditionally, so it must work with only
  // ensureCurrenciesTable having run — no seedIfEmpty, no prior read.
  it('upserts correctly against a table that was only ever ensured, never read or seeded', async () => {
    const freshDb = makeNodeProxyDb();
    await ensureCurrenciesTable(freshDb);

    await restoreCurrencyCatalog(freshDb, [
      { code: 'JPY', offBudget: true, sortOrder: 1, archived: false },
    ]);

    const catalog = await getCurrencyCatalog(freshDb);
    expect(catalog).toEqual([{ code: 'JPY', offBudget: true, sortOrder: 1, archived: false }]);
  });

  it('round-trips getCurrencyCatalog through restoreCurrencyCatalog, including archived rows', async () => {
    await setCurrencyArchived(db, 'GBP', true);
    const catalog = await getCurrencyCatalog(db);

    const freshDb = makeNodeProxyDb();
    await ensureCurrenciesTable(freshDb);
    await restoreCurrencyCatalog(freshDb, catalog);

    expect(await getCurrencyCatalog(freshDb)).toEqual(catalog);
  });
});
