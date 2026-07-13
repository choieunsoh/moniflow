import { describe, it, expect } from 'vitest';
import { formatCurrency, currencySymbol } from './money';

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
