import { describe, it, expect } from 'vitest';
import type { FxRates } from '@features/settings/queries';
import { FEE_STEPS, parseAmount, resolvePair, convertRows, rateDate } from './convert';

const rates: FxRates = {
  JPY: { thbPerUnit: 0.22, asOf: '2026-10-02' },
  USD: { thbPerUnit: 33, asOf: '2026-10-03' },
};

function okRows(amount: number | null, from: string, to: string) {
  const result = convertRows(amount, from, to, rates);
  if (result.kind !== 'ok') throw new Error(`expected ok, got missing ${result.code}`);
  return result.rows;
}

describe('parseAmount', () => {
  it('accepts plain and comma-grouped decimals', () => {
    expect(parseAmount('1200')).toBe(1200);
    expect(parseAmount('1,200.50')).toBe(1200.5);
  });

  it('rejects empty, zero, negative and junk', () => {
    for (const raw of ['', '   ', '0', '-5', 'abc', '1.2.3']) expect(parseAmount(raw)).toBeNull();
  });
});

describe('resolvePair', () => {
  const codes = ['THB', 'JPY', 'USD'];

  it('defaults to the first foreign currency into THB', () => {
    expect(resolvePair(codes, null, null)).toEqual({ from: 'JPY', to: 'THB' });
  });

  it('keeps valid params and replaces unknown ones', () => {
    expect(resolvePair(codes, 'USD', 'JPY')).toEqual({ from: 'USD', to: 'JPY' });
    expect(resolvePair(codes, 'XXX', 'YYY')).toEqual({ from: 'JPY', to: 'THB' });
  });

  it('has nothing to convert when THB is the only currency', () => {
    expect(resolvePair(['THB'], null, null)).toBeNull();
  });
});

describe('convertRows', () => {
  it('foreign → THB: the fee raises the baht you pay', () => {
    const rows = okRows(1000, 'JPY', 'THB');
    expect(rows.map((r) => r.feePct)).toEqual([...FEE_STEPS]);
    expect(rows[0].perUnit).toBeCloseTo(0.22, 10);
    expect(rows[0].total).toBeCloseTo(220, 10);
    expect(rows[3].perUnit).toBeCloseTo(0.2255, 10);
    expect(rows[3].total).toBeCloseTo(225.5, 10);
  });

  it('THB → foreign: the fee lowers the foreign amount you get', () => {
    const rows = okRows(10000, 'THB', 'JPY');
    expect(rows[0].total).toBeCloseTo(10000 / 0.22, 6);
    expect(rows[3].total).toBeCloseTo(10000 / 0.2255, 6);
    expect(rows[3].total ?? 0).toBeLessThan(rows[0].total ?? 0);
  });

  it('cross pair: a single mid-rate row', () => {
    const rows = okRows(100, 'USD', 'JPY');
    expect(rows).toHaveLength(1);
    expect(rows[0].feePct).toBe(0);
    expect(rows[0].perUnit).toBeCloseTo(33 / 0.22, 10);
  });

  it('same currency: a single 1:1 row', () => {
    const rows = okRows(5, 'JPY', 'JPY');
    expect(rows).toEqual([{ feePct: 0, perUnit: 1, total: 5 }]);
  });

  it('no amount: per-unit only, totals null', () => {
    for (const r of okRows(null, 'JPY', 'THB')) expect(r.total).toBeNull();
  });

  it('reports a missing rate instead of inventing one', () => {
    expect(convertRows(1, 'KRW', 'THB', rates)).toEqual({ kind: 'missing', code: 'KRW' });
    expect(convertRows(1, 'THB', 'KRW', rates)).toEqual({ kind: 'missing', code: 'KRW' });
  });
});

describe('rateDate', () => {
  it('uses the foreign side, the source when both are foreign', () => {
    expect(rateDate('JPY', 'THB', rates)).toBe('2026-10-02');
    expect(rateDate('THB', 'USD', rates)).toBe('2026-10-03');
    expect(rateDate('USD', 'JPY', rates)).toBe('2026-10-03');
    expect(rateDate('THB', 'THB', rates)).toBeNull();
  });
});
