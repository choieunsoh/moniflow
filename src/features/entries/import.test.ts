import { describe, it, expect } from 'vitest';
import { parseCsv } from './import';

describe('parseCsv', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields and strips the quotes', () => {
    expect(parseCsv('x,"12,000",y')).toEqual([['x', '12,000', 'y']]);
  });

  it('handles a trailing empty field and ignores blank lines', () => {
    expect(parseCsv('a,b,\n\n')).toEqual([['a', 'b', '']]);
  });
});
