import { describe, expect, it } from 'vitest';
import { evaluate, nextExpr, KEYPAD_KEYS } from './calc';

// Type the whole string one key at a time, the way the keypad feeds it.
const type = (keys: string): string => [...keys].reduce(nextExpr, '');

describe('nextExpr', () => {
  it('appends digits and a single decimal point', () => {
    expect(type('1234.56')).toBe('1234.56');
    expect(type('.5')).toBe('0.5'); // a leading '.' opens with a zero
  });

  it('stops at 2 decimals — the ledger renders satang, so it must not take a third', () => {
    expect(type('1234.567')).toBe('1234.56');
    expect(type('1.9999')).toBe('1.99');
  });

  it('counts the decimals of the number being keyed, not the whole expression', () => {
    // The cap is per-operand: 1.99 is full, but 2.5 after the + still has room.
    expect(type('1.99+2.5')).toBe('1.99+2.5');
    expect(type('1.99+2.567')).toBe('1.99+2.56');
  });

  it('leaves whole numbers alone — the cap only applies past a decimal point', () => {
    expect(type('123456')).toBe('123456');
  });

  it('refuses a second decimal point in one number', () => {
    expect(type('1.2.3')).toBe('1.23');
  });

  it('never opens with an operator, and replaces a doubled one', () => {
    expect(type('+')).toBe('');
    expect(type('1+×')).toBe('1×');
  });

  it('backspaces the last character', () => {
    expect(nextExpr('1234.56', '⌫')).toBe('1234.5');
    expect(nextExpr('', '⌫')).toBe('');
  });

  it('keys a figure that evaluate() then reads back exactly', () => {
    expect(evaluate(type('1234.56'))).toBe(1234.56);
  });
});

describe('evaluate', () => {
  it('returns null for empty / operator-only input', () => {
    expect(evaluate('')).toBeNull();
    expect(evaluate('+')).toBeNull();
    expect(evaluate('  ')).toBeNull();
  });

  it('reads a plain number', () => {
    expect(evaluate('120')).toBe(120);
    expect(evaluate('45.5')).toBe(45.5);
    expect(evaluate('.5')).toBe(0.5);
  });

  it('adds and subtracts', () => {
    expect(evaluate('120+45')).toBe(165);
    expect(evaluate('100-30')).toBe(70);
    expect(evaluate('45.5+0.5')).toBe(46);
  });

  it('multiplies and divides (× ÷ glyphs normalized)', () => {
    expect(evaluate('6×7')).toBe(42);
    expect(evaluate('84÷2')).toBe(42);
  });

  it('honours × ÷ precedence over + −', () => {
    expect(evaluate('2+3×4')).toBe(14);
    expect(evaluate('10-2×3')).toBe(4);
  });

  it('returns null on division by zero', () => {
    expect(evaluate('10÷0')).toBeNull();
  });

  it('evaluates the part before a dangling trailing operator', () => {
    expect(evaluate('12+')).toBe(12);
    expect(evaluate('12×')).toBe(12);
  });

  it('returns null on malformed input', () => {
    expect(evaluate('12++5')).toBeNull();
  });
});

describe('KEYPAD_KEYS', () => {
  // The two layouts must be the SAME keys in a different order — a layout that quietly dropped '⌫'
  // or gained a key would render a grid the other one can't, and only one of them is ever on screen.
  it('offers an identical key set in both layouts', () => {
    expect([...KEYPAD_KEYS.phone].sort()).toEqual([...KEYPAD_KEYS.calc].sort());
    expect(KEYPAD_KEYS.calc).toHaveLength(16); // 4 columns × 4 rows
  });

  it('swaps only the digit rows — the operator column and bottom row stay put', () => {
    // Column 4 is the operators; the last row is . 0 ⌫ +. Everything a layout changes is a digit.
    const col4 = (keys: readonly string[]) => keys.filter((_, i) => i % 4 === 3);
    expect(col4(KEYPAD_KEYS.phone)).toEqual(col4(KEYPAD_KEYS.calc));
    expect(KEYPAD_KEYS.phone.slice(12)).toEqual(KEYPAD_KEYS.calc.slice(12));
    expect(KEYPAD_KEYS.calc.slice(0, 3)).toEqual(['7', '8', '9']);
    expect(KEYPAD_KEYS.phone.slice(0, 3)).toEqual(['1', '2', '3']);
  });
});
