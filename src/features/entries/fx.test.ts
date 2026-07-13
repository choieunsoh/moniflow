import { describe, it, expect } from 'vitest';
import { parseVisaThbPerUnit, withFee, toThb, visaRatesUrl } from './fx';

// Trimmed real responses captured from usa.visa.com (fromCurr=THB&toCurr=<X>, fee=0). fxRateVisa is
// THB per 1 unit of X, Visa markup included — matched against Visa's own website to the last digit.
const VISA_JPY = {
  conversionFromCurrency: 'THB',
  conversionToCurrency: 'JPY',
  fxRateVisa: '0.2075526048',
  reverseAmount: '4.818055',
  status: 'success',
};
const VISA_USD = {
  conversionFromCurrency: 'THB',
  conversionToCurrency: 'USD',
  fxRateVisa: '33.46996653',
  reverseAmount: '0.029877',
  status: 'success',
};

describe('parseVisaThbPerUnit', () => {
  it('extracts THB-per-unit from fxRateVisa (JPY < 1, USD ~33) — a direction flip would break these bands', () => {
    const jpy = parseVisaThbPerUnit(VISA_JPY);
    const usd = parseVisaThbPerUnit(VISA_USD);
    expect(jpy).toBeCloseTo(0.2075526048, 6);
    expect(usd).toBeCloseTo(33.46996653, 6);
    expect(jpy).toBeGreaterThan(0.05);
    expect(jpy).toBeLessThan(1);
    expect(usd).toBeGreaterThan(20);
    expect(usd).toBeLessThan(50);
  });

  it('throws on a missing or non-numeric fxRateVisa', () => {
    expect(() => parseVisaThbPerUnit({})).toThrow();
    expect(() => parseVisaThbPerUnit({ fxRateVisa: 'x' })).toThrow();
    expect(() => parseVisaThbPerUnit(null)).toThrow();
  });
});

describe('withFee', () => {
  it('layers a percentage markup on the base rate', () => {
    expect(withFee(33.21, 2)).toBeCloseTo(33.8742, 4);
    expect(withFee(0.2, 0)).toBe(0.2);
  });
});

describe('toThb', () => {
  it('converts a foreign amount at an effective rate, rounded to whole THB', () => {
    expect(toThb(3000, 0.208)).toBe(624);
    expect(toThb(20, 33.8742)).toBe(677);
  });
});

describe('visaRatesUrl', () => {
  it('builds the usa.visa.com URL with fee=0, THB source, foreign target, and an MM/DD/YYYY date', () => {
    const url = visaRatesUrl('JPY', new Date('2026-07-13T00:00:00Z'));
    expect(url).toContain('https://usa.visa.com/cmsapi/fx/rates?');
    expect(url).toContain('fromCurr=THB');
    expect(url).toContain('toCurr=JPY');
    expect(url).toContain('fee=0');
    expect(url).toContain('exchangedate=07%2F13%2F2026');
  });
});
