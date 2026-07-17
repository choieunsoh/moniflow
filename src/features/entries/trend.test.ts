import { describe, it, expect } from 'vitest';
import {
  monthLabel,
  toTrendBars,
  buildTrendOption,
  completeBars,
  trendAverage,
  type TrendBar,
  type TrendPalette,
} from './trend';
import { lastCycles } from './cycle';

const PALETTE: TrendPalette = {
  text: '#fff',
  muted: '#888',
  border: '#333',
  surface2: '#1e2128',
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

describe('buildTrendOption average line', () => {
  const bars: TrendBar[] = [
    { key: '2026-05', label: 'May', value: 100, partial: false },
    { key: '2026-06', label: 'Jun', value: 300, partial: false },
    { key: '2026-07', label: 'Jul', value: 50, partial: true },
  ];

  it('draws the line at the average of the complete cycles', () => {
    expect(buildTrendOption(bars, PALETTE).series[0].markLine?.data).toEqual([{ yAxis: 200 }]);
  });

  it('names the line, so a bare figure cannot be read as a budget or a target', () => {
    expect(buildTrendOption(bars, PALETTE).series[0].markLine?.label.formatter).toBe(
      'Average ฿200',
    );
  });

  it('draws no line when there is too little history to average', () => {
    const thin: TrendBar[] = [{ key: '2026-07', label: 'Jul', value: 50, partial: true }];
    expect(buildTrendOption(thin, PALETTE).series[0].markLine).toBeUndefined();
  });

  it('never sets a y-axis max, so the bars are always scaled to the data', () => {
    // Regression guard. The budget line forced yAxis.max to reach a limit that could sit far above
    // every bar — a ฿4,899 bar under a ฿30,000 line rendered at 16% height. An average is always
    // inside the data's range, so the axis must simply never be forced again.
    expect(buildTrendOption(bars, PALETTE).yAxis.max).toBeUndefined();
  });

  it('keeps the line off the bars ink, so the reference reads as a reference', () => {
    expect(buildTrendOption(bars, PALETTE).series[0].markLine?.lineStyle.color).toBe(
      PALETTE.border,
    );
  });
});

describe('completeBars', () => {
  it('drops the live cycle — it is still filling up, so it is not comparable', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 200, partial: true },
    ];
    expect(completeBars(bars).map((b) => b.key)).toEqual(['2026-05']);
  });

  it('drops zero cycles — a zero is almost always "not tracking yet", not "spent nothing"', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 0, partial: false },
      { key: '2026-06', label: 'Jun', value: 200, partial: false },
    ];
    expect(completeBars(bars).map((b) => b.key)).toEqual(['2026-06']);
  });

  it('keeps every complete cycle with spend', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 200, partial: false },
    ];
    expect(completeBars(bars)).toHaveLength(2);
  });
});

describe('trendAverage', () => {
  it('averages the complete cycles that have spend', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 300, partial: false },
    ];
    expect(trendAverage(bars)).toBe(200);
  });

  it('ignores the live cycle even when it is the largest bar', () => {
    // Day 30 of a heavy month must not drag the average up any more than day 2 drags it down.
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 300, partial: false },
      { key: '2026-07', label: 'Jul', value: 9000, partial: true },
    ];
    expect(trendAverage(bars)).toBe(200);
  });

  it('ignores leading zeros, so a short history is not averaged against months you were not tracking', () => {
    // The bug this prevents: four pre-tracking zeros halve the line, and then every real cycle
    // reports as above-normal.
    const bars: TrendBar[] = [
      { key: '2026-02', label: 'Feb', value: 0, partial: false },
      { key: '2026-03', label: 'Mar', value: 0, partial: false },
      { key: '2026-04', label: 'Apr', value: 100, partial: false },
      { key: '2026-05', label: 'May', value: 300, partial: false },
    ];
    expect(trendAverage(bars)).toBe(200);
  });

  it('returns null with one complete cycle — a line on your only bar is noise, not a comparison', () => {
    const bars: TrendBar[] = [
      { key: '2026-05', label: 'May', value: 100, partial: false },
      { key: '2026-06', label: 'Jun', value: 300, partial: true },
    ];
    expect(trendAverage(bars)).toBeNull();
  });

  it('returns null with no data at all', () => {
    expect(trendAverage([])).toBeNull();
  });
});
