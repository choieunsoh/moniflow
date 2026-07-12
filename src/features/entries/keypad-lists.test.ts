import { describe, expect, it } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { addCategory, setCategoryOrder } from '@features/categories/queries';
import { sortByManualOrder, getKeypadCategories } from './keypad-lists';

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
