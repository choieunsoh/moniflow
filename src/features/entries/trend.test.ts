import { describe, it, expect } from 'vitest';
import {
  monthLabel,
  toTrendBars,
  buildTrendOption,
  type TrendBar,
  type TrendPalette,
} from './trend';
import { lastCycles } from './cycle';

const PALETTE: TrendPalette = {
  text: '#fff',
  muted: '#888',
  border: '#333',
  accent: '#7c5cff',
  font: 'Inter',
};

describe('monthLabel', () => {
  it('renders the cycle key as its start month', () => {
    expect(monthLabel('2026-07')).toBe('Jul');
    expect(monthLabel('2026-01')).toBe('Jan');
    expect(monthLabel('2025-12')).toBe('Dec');
  });
});

describe('toTrendBars', () => {
  const cycles = lastCycles('2026-07', 3);

  it('maps each cycle to a bar in window order', () => {
    const bars = toTrendBars(cycles, new Map([['2026-05', 100]]), '2026-07');
    expect(bars.map((b) => b.key)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(bars.map((b) => b.label)).toEqual(['May', 'Jun', 'Jul']);
  });

  it('reads spend from the map and defaults a cycle with no spend to zero', () => {
    const bars = toTrendBars(cycles, new Map([['2026-05', 100]]), '2026-07');
    expect(bars.map((b) => b.value)).toEqual([100, 0, 0]);
  });

  it('marks only the live cycle partial', () => {
    const bars = toTrendBars(cycles, new Map(), '2026-07');
    expect(bars.map((b) => b.partial)).toEqual([false, false, true]);
  });

  it('marks nothing partial when the window is entirely in the past', () => {
    const past = lastCycles('2026-03', 3);
    const bars = toTrendBars(past, new Map(), '2026-07');
    expect(bars.map((b) => b.partial)).toEqual([false, false, false]);
  });
});

describe('buildTrendOption', () => {
  const bars: TrendBar[] = [
    { key: '2026-05', label: 'May', value: 100, partial: false },
    { key: '2026-06', label: 'Jun', value: 200, partial: false },
    { key: '2026-07', label: 'Jul', value: 50, partial: true },
  ];

  it('puts the bar labels on the x axis', () => {
    const option = buildTrendOption(bars, PALETTE);
    expect(option.xAxis.data).toEqual(['May', 'Jun', 'Jul']);
  });

  it('carries every bar value into the series', () => {
    const option = buildTrendOption(bars, PALETTE);
    expect(option.series[0].data.map((d) => d.value)).toEqual([100, 200, 50]);
  });

  it('accents the anchor bar and mutes the rest', () => {
    const option = buildTrendOption(bars, PALETTE);
    const colors = option.series[0].data.map((d) => d.itemStyle.color);
    expect(colors).toEqual([PALETTE.muted, PALETTE.muted, PALETTE.accent]);
  });

  it('fades the partial bar so an unfinished cycle never reads as a spending drop', () => {
    const option = buildTrendOption(bars, PALETTE);
    expect(option.series[0].data[2].itemStyle.opacity).toBeLessThan(1);
  });

  it('renders a complete anchor at full strength', () => {
    const complete = bars.map((b) => ({ ...b, partial: false }));
    const option = buildTrendOption(complete, PALETTE);
    expect(option.series[0].data[2].itemStyle.opacity).toBe(1);
  });
});
