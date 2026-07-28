import { describe, it, expect } from 'vitest';
import { addableCurrencies } from './addable';

describe('addableCurrencies', () => {
  it('offers ISO codes that are not already in the catalog', () => {
    const list = addableCurrencies(new Set(['THB', 'JPY']));
    expect(list).toContain('TWD');
    expect(list).not.toContain('THB');
    expect(list).not.toContain('JPY');
  });

  it('returns codes in alphabetical order', () => {
    const list = addableCurrencies(new Set());
    expect([...list].sort()).toEqual(list);
  });

  it('never offers a code Intl cannot format', () => {
    for (const code of addableCurrencies(new Set())) {
      expect(() =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(1),
      ).not.toThrow();
    }
  });
});
