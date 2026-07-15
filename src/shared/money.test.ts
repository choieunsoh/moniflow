import { describe, it, expect } from 'vitest';
import { formatBaht, formatSignedBaht, formatCurrency, currencySymbol } from './money';

describe('formatBaht', () => {
  it('keeps a whole baht amount plain — no trailing .00 to read past', () => {
    expect(formatBaht(120)).toBe('฿120');
    expect(formatBaht(30000)).toBe('฿30,000');
  });

  it('shows the satang when there are any, instead of rounding them away', () => {
    expect(formatBaht(1234.56)).toBe('฿1,234.56');
  });

  it('pads to a full 2 decimals so money never reads as ฿1,234.5', () => {
    expect(formatBaht(1234.5)).toBe('฿1,234.50');
  });

  it('caps at 2 decimals — satang is the smallest THB unit', () => {
    expect(formatBaht(1234.567)).toBe('฿1,234.57');
  });

  it('absorbs float drift from summed reals rather than inventing satang', () => {
    // 1234.56 + 120 in IEEE-754 lands on 1354.5600000000002; 0.1 + 0.2 → 0.30000000000000004.
    expect(formatBaht(1234.56 + 120)).toBe('฿1,354.56');
    expect(formatBaht(119.99999999999999)).toBe('฿120');
  });
});

describe('formatSignedBaht', () => {
  it('carries the satang through the signed ledger form', () => {
    expect(formatSignedBaht(-1234.56)).toBe('−฿1,234.56');
    expect(formatSignedBaht(120)).toBe('+฿120');
  });
});

describe('formatCurrency', () => {
  it('renders a 0-decimal currency (JPY) with its narrow symbol and no fraction', () => {
    expect(formatCurrency(3000, 'JPY')).toBe('¥3,000');
  });

  it('renders a 2-decimal currency (USD) with its narrow symbol', () => {
    expect(formatCurrency(20, 'USD')).toBe('$20.00');
  });
});

describe('currencySymbol', () => {
  it('returns the narrow symbol glyph for a code', () => {
    expect(currencySymbol('JPY')).toBe('¥');
    expect(currencySymbol('THB')).toBe('฿');
    expect(currencySymbol('KRW')).toBe('₩');
  });
});
