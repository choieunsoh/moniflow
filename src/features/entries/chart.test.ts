import { describe, it, expect } from 'vitest';
import { toCumulativeBalance, buildFlowOption } from './chart';
import type { Entry } from './schema';

const e = (id: number, date: string, amount: number): Entry => ({
  id,
  date,
  account: 'cash',
  category: 'x',
  amount,
  note: null,
});

describe('toCumulativeBalance', () => {
  it('accumulates signed amounts into end-of-day running balance, in date order', () => {
    const points = toCumulativeBalance([
      e(2, '2026-07-02', -12000),
      e(1, '2026-07-01', 50000),
      e(3, '2026-07-03', 3000),
    ]);
    expect(points).toEqual([
      { date: '2026-07-01', balance: 50000 },
      { date: '2026-07-02', balance: 38000 },
      { date: '2026-07-03', balance: 41000 },
    ]);
  });

  it('collapses multiple same-date entries to the end-of-day balance', () => {
    const points = toCumulativeBalance([e(1, '2026-07-01', 100), e(2, '2026-07-01', -40)]);
    expect(points).toEqual([{ date: '2026-07-01', balance: 60 }]);
  });
});

describe('buildFlowOption', () => {
  it('produces one line series whose data matches the cumulative points', () => {
    const palette = {
      accent: '#7132f5',
      accentSoft: 'rgba(0,0,0,0.1)',
      text: '#fff',
      muted: '#999',
      border: '#333',
    };
    const option = buildFlowOption(
      [e(1, '2026-07-01', 50000), e(2, '2026-07-02', -12000)],
      palette,
    );
    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe('line');
    expect(option.series[0].data).toEqual([50000, 38000]);
    expect(option.xAxis.data).toEqual(['2026-07-01', '2026-07-02']);
  });
});
