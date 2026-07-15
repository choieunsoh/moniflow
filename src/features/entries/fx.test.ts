import { describe, it, expect } from 'vitest';
import { parseEcbResponse, withFee, toThb, frankfurterUrl } from './fx';

// A trimmed real response from api.frankfurter.dev (base=THB). rates are foreign-per-THB; the parser
// inverts them to THB-per-foreign (e.g. 1/4.8588 ≈ 0.2058 THB per JPY, 1/0.03002 ≈ 33.31 per USD).
const ECB = {
  amount: 1,
  base: 'THB',
  date: '2026-07-10',
  rates: {
    EUR: 0.02626,
    GBP: 0.02236,
    HKD: 0.23533,
    JPY: 4.8588,
    KRW: 45.172,
    SGD: 0.03875,
    USD: 0.03002,
  },
};

describe('parseEcbResponse', () => {
  it('inverts foreign-per-THB into THB-per-unit (JPY < 1, USD ~33) and keeps the date', () => {
    const { date, thbPerUnit } = parseEcbResponse(ECB);
    expect(date).toBe('2026-07-10');
    expect(thbPerUnit.JPY).toBeCloseTo(1 / 4.8588, 8); // ≈ 0.205812 THB per JPY
    expect(thbPerUnit.USD).toBeCloseTo(1 / 0.03002, 8); // ≈ 33.3111 THB per USD
    expect(thbPerUnit.JPY).toBeGreaterThan(0.05);
    expect(thbPerUnit.JPY).toBeLessThan(1);
    expect(thbPerUnit.USD).toBeGreaterThan(20);
    expect(thbPerUnit.USD).toBeLessThan(50);
  });

  it('throws on a missing/misshaped payload', () => {
    expect(() => parseEcbResponse({})).toThrow();
    expect(() => parseEcbResponse({ date: '2026-07-10' })).toThrow();
    expect(() => parseEcbResponse({ date: '2026-07-10', rates: {} })).toThrow();
    expect(() => parseEcbResponse(null)).toThrow();
  });
});

describe('withFee', () => {
  it('layers a percentage markup on the base rate', () => {
    expect(withFee(33.31, 2)).toBeCloseTo(33.9762, 4);
    expect(withFee(0.2, 0)).toBe(0.2);
  });
});

describe('toThb', () => {
  it('converts a foreign amount at an effective rate, rounded to satang', () => {
    expect(toThb(3000, 0.21)).toBe(630);
    expect(toThb(20, 33.9762)).toBe(679.52);
    expect(toThb(107, 34.1234)).toBe(3651.2);
  });

  // Regression: this rounded to whole baht while the ledger displayed whole baht too. Once money.ts
  // began stating satang the rounding became a silent write-time loss of up to 50 satang per foreign
  // entry — and the keypad showed "= ฿3,651.00" for arithmetic that reads 3,651.20.
  it('keeps the satang a whole-baht rounding would have eaten', () => {
    expect(toThb(107, 34.1234)).not.toBe(3651);
  });

  // The product of two reals carries IEEE-754 drift (107 × 34.1234 → 3651.2038000000004); rounding to
  // satang is what keeps a stored amount at real money precision rather than passing the noise on.
  it('does not leak float drift into the stored amount', () => {
    expect(toThb(0.1 + 0.2, 10)).toBe(3);
  });
});

describe('frankfurterUrl', () => {
  it('builds a THB-based URL listing every non-THB currency as symbols', () => {
    const url = frankfurterUrl(['THB', 'JPY', 'USD']);
    expect(url).toContain('https://api.frankfurter.dev/v1/latest?');
    expect(url).toContain('base=THB');
    expect(url).toContain('symbols=JPY,USD');
    expect(url).not.toContain('THB,'); // THB excluded from symbols
  });
});
