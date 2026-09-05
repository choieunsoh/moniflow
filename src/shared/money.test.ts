import { globSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  formatBaht,
  formatBahtWhole,
  formatBahtKeyed,
  formatSignedBaht,
  formatLedgerSpend,
  formatCurrency,
  currencySymbol,
} from './money';

describe('formatBaht', () => {
  it('always states the satang — ฿XXX.XX, even when the amount is whole', () => {
    expect(formatBaht(228)).toBe('฿228.00');
    expect(formatBaht(30000)).toBe('฿30,000.00');
  });

  it('shows the satang when there are any, instead of rounding them away', () => {
    expect(formatBaht(1234.56)).toBe('฿1,234.56');
    expect(formatBaht(1234.5)).toBe('฿1,234.50');
  });

  it('caps at 2 decimals — satang is the smallest THB unit', () => {
    expect(formatBaht(1234.567)).toBe('฿1,234.57');
  });

  it('absorbs float drift from summed reals rather than inventing satang', () => {
    // 1234.56 + 120 in IEEE-754 lands on 1354.5600000000002.
    expect(formatBaht(1234.56 + 120)).toBe('฿1,354.56');
    expect(formatBaht(119.99999999999999)).toBe('฿120.00');
  });
});

describe('formatBahtWhole', () => {
  it('rounds away the satang for glance figures like the donut hole', () => {
    expect(formatBahtWhole(1354.56)).toBe('฿1,355');
    expect(formatBahtWhole(228)).toBe('฿228');
  });
});

describe('formatBahtKeyed', () => {
  it('echoes the figure as keyed — it pads nothing on and rounds nothing away', () => {
    expect(formatBahtKeyed(123)).toBe('฿123'); // not ฿123.00
    expect(formatBahtKeyed(123.1)).toBe('฿123.1'); // not ฿123.10
    expect(formatBahtKeyed(123.12)).toBe('฿123.12');
  });

  it('still groups thousands and caps at the 2 decimals the keypad allows', () => {
    expect(formatBahtKeyed(1234.5)).toBe('฿1,234.5');
    expect(formatBahtKeyed(1234.567)).toBe('฿1,234.57');
  });
});

describe('formatSignedBaht', () => {
  it('carries the satang through the signed ledger form', () => {
    expect(formatSignedBaht(-1234.56)).toBe('−฿1,234.56');
    expect(formatSignedBaht(120)).toBe('+฿120.00');
  });
});

describe('formatLedgerSpend', () => {
  it('renders an ordinary (negative) row as a plain cost — no sign', () => {
    expect(formatLedgerSpend(-1234.56)).toBe('฿1,234.56');
  });

  it('renders a refund (positive) row with an explicit sign', () => {
    expect(formatLedgerSpend(120)).toBe('+฿120.00');
  });

  // A section header sums the rows under it, and a sum of stored amounts is in the SAME frame as
  // any one of them, so it takes the same formatter. /records used to negate first
  // (`total > 0 ? formatSignedBaht(-total) : formatBaht(-total)`), which is the opposite reading:
  // it printed −฿888 on a header while the single refund row thirty pixels below printed +฿888.
  it('signs a summed refund the same way as the lone row that made it', () => {
    const refund = 888;
    expect(formatLedgerSpend(refund)).toBe(formatLedgerSpend([refund].reduce((a, b) => a + b, 0)));
    expect(formatLedgerSpend(refund)).not.toBe(formatSignedBaht(-refund));
  });
});

// Two formatters that both look right can still disagree about which way is positive, and nothing in
// the type system notices — both take a number and return a string. This scan is the only mechanical
// check that a ledger figure is signed in one place. `formatLedgerSpend` owns the negation; a caller
// that negates on its own has, by definition, picked the other frame.
describe('nothing re-implements the ledger sign', () => {
  const sources = globSync('src/**/*.{ts,tsx}', {
    exclude: (path) => path.includes('.test.') || path.endsWith('money.ts'),
  });

  it('no file negates a ledger amount on its way into formatSignedBaht', () => {
    const offenders = sources.filter((file) =>
      readFileSync(file, 'utf-8').includes('formatSignedBaht(-'),
    );
    expect(offenders).toEqual([]);
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
