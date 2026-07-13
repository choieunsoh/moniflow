import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { initDb } from '@db/client';
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
  it('returns tiles in the persisted manual order', () => {
    const d = initDb(':memory:');
    ensureEntriesTable(d);
    ensureCategoriesTable(d);
    addCategory(d, 'Food');
    addCategory(d, 'Coffee');
    setCategoryOrder(d, ['Coffee', 'Food']);
    expect(getKeypadCategories(d).map((c) => c.name)).toEqual(['Coffee', 'Food']);
  });
});

describe('getKeypadCurrencies', () => {
  it('pins THB first, orders the rest by usage, and appends unused currencies', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    // 3 JPY rows, 1 USD row, no others.
    db.run(sql`INSERT INTO entries (date, amount, currency, source) VALUES
      ('2026-07-01', -100, 'JPY', 'manual'),
      ('2026-07-02', -100, 'JPY', 'manual'),
      ('2026-07-03', -100, 'JPY', 'manual'),
      ('2026-07-04', -100, 'USD', 'manual')`);

    const codes = getKeypadCurrencies(db).map((c) => c.code);
    expect(codes[0]).toBe('THB'); // always first
    expect(codes.indexOf('JPY')).toBeLessThan(codes.indexOf('USD')); // more-used first
    // every known currency appears exactly once
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('KRW'); // unused, still present
  });

  it('carries a symbol for each currency', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    const thb = getKeypadCurrencies(db).find((c) => c.code === 'THB');
    expect(thb?.symbol).toBe('฿');
  });
});
