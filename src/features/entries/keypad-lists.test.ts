import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { addCategory, setCategoryOrder } from '@features/categories/queries';
import { sortByManualOrder, getKeypadCategories, getKeypadCurrencies } from './keypad-lists';

describe('sortByManualOrder', () => {
  it('floats ordered items to the front in their chosen sequence', () => {
    const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    expect(sortByManualOrder(items, { C: 0, A: 1 }).map((x) => x.name)).toEqual(['C', 'A', 'B']);
  });

  it('keeps unordered items in their incoming order, after the ordered ones', () => {
    const items = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    expect(sortByManualOrder(items, { B: 0 }).map((x) => x.name)).toEqual(['B', 'A', 'C']);
  });

  it('is identity when the order map is empty', () => {
    const items = [{ name: 'A' }, { name: 'B' }];
    expect(sortByManualOrder(items, {}).map((x) => x.name)).toEqual(['A', 'B']);
  });
});

describe('getKeypadCategories', () => {
  it('returns tiles in the persisted manual order', async () => {
    const d = makeNodeProxyDb();
    await ensureEntriesTable(d);
    await ensureCategoriesTable(d);
    await addCategory(d, 'Food');
    await addCategory(d, 'Coffee');
    await setCategoryOrder(d, ['Coffee', 'Food']);
    expect((await getKeypadCategories(d)).map((c) => c.name)).toEqual(['Coffee', 'Food']);
  });
});

describe('getKeypadCurrencies', () => {
  it('pins THB first, orders the rest by usage, and appends unused currencies', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    // 3 JPY rows, 1 USD row, no others.
    await db.run(sql`INSERT INTO entries (date, amount, currency, source) VALUES
      ('2026-07-01', -100, 'JPY', 'manual'),
      ('2026-07-02', -100, 'JPY', 'manual'),
      ('2026-07-03', -100, 'JPY', 'manual'),
      ('2026-07-04', -100, 'USD', 'manual')`);

    const codes = (await getKeypadCurrencies(db)).map((c) => c.code);
    expect(codes[0]).toBe('THB'); // always first
    expect(codes.indexOf('JPY')).toBeLessThan(codes.indexOf('USD')); // more-used first
    // every known currency appears exactly once
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('KRW'); // unused, still present
  });

  it('carries a symbol for each currency', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    const thb = (await getKeypadCurrencies(db)).find((c) => c.code === 'THB');
    expect(thb?.symbol).toBe('฿');
  });
});
