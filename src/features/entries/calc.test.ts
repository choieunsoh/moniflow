import { describe, expect, it } from 'vitest';
import { evaluate } from './calc';

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
