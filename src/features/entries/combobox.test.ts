import { describe, it, expect } from 'vitest';
import { filterSuggestions, wrapIndex } from './combobox';

describe('filterSuggestions', () => {
  const all = ['Cash', 'KTC X VISA', 'UOB Grab', 'Groceries', 'กาแฟ'];

  it('matches a substring anywhere, case-insensitively', () => {
    expect(filterSuggestions(all, 'gr')).toEqual(['Groceries', 'UOB Grab']); // prefix ranks first
  });

  it('ranks prefix matches above mid-string matches, otherwise keeps source order', () => {
    expect(filterSuggestions(['Grab', 'UOB Grab', 'Grocery'], 'gr')).toEqual([
      'Grab', // prefix
      'Grocery', // prefix, source order after Grab
      'UOB Grab', // contains-elsewhere, last
    ]);
  });

  it('matches non-ASCII text', () => {
    expect(filterSuggestions(all, 'กาแฟ')).toEqual(['กาแฟ']);
  });

  it('returns nothing for a blank query', () => {
    expect(filterSuggestions(all, '   ')).toEqual([]);
  });

  it('caps the result count', () => {
    const many = Array.from({ length: 20 }, (_, i) => `item ${i}`);
    expect(filterSuggestions(many, 'item', 5)).toHaveLength(5);
  });
});

describe('wrapIndex', () => {
  it('wraps past the end back to the start and vice versa', () => {
    expect(wrapIndex(2, 3, 1)).toBe(0); // last → first
    expect(wrapIndex(0, 3, -1)).toBe(2); // first → last
    expect(wrapIndex(-1, 3, 1)).toBe(0); // from "none highlighted", down → first
  });

  it('returns -1 for an empty list', () => {
    expect(wrapIndex(0, 0, 1)).toBe(-1);
  });
});
