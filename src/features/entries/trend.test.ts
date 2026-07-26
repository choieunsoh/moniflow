import { describe, it, expect } from 'vitest';
import {
  monthLabel,
  yearLabel,
  toTrendBars,
  buildTrendOption,
  completeBars,
  trendAverage,
  trendSummary,
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
  warn: '#f5a524',
  font: 'Inter',
};

describe('monthLabel', () => {
  it('renders the cycle key as its start month', () => {
    expect(monthLabel('2026-07')).toBe('Jul');
    expect(monthLabel('2026-01')).toBe('Jan');
    expect(monthLabel('2025-12')).toBe('Dec');
  });
});

describe('yearLabel', () => {
  // /month's axis is years, not months — every bar in that window shares one month, so the month
  // name would repeat down the whole axis and say nothing.
  it('renders the cycle key as its start year', () => {
    expect(yearLabel('2026-07')).toBe('2026');
    expect(yearLabel('2025-12')).toBe('2025');
  });
});

describe('toTrendBars labelling', () => {
  it('labels by start month by default', () => {
    const bars = toTrendBars(lastCycles('2026-07', 2), new Map(), '2026-07');
    expect(bars.map((b) => b.label)).toEqual(['Jun', 'Jul']);
  });

  it('takes a label function, so a year-keyed window can label by year', () => {
    const bars = toTrendBars(lastCycles('2026-07', 2), new Map(), '2026-07', yearLabel);
    expect(bars.map((b) => b.label)).toEqual(['2026', '2026']);
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

describe('buildTrendOption reference lines', () => {
  const bars: TrendBar[] = [
    { key: '2026-05', label: 'May', value: 100, partial: false },
    { key: '2026-06', label: 'Jun', value: 300, partial: false },
    { key: '2026-07', label: 'Jul', value: 50, partial: true },
  ];
  // Complete cycles May(100) + Jun(300) → average 200; tallest bar is 300.
  const lines = (option: ReturnType<typeof buildTrendOption>) =>
    option.series[0].markLine?.data ?? [];
  const named = (option: ReturnType<typeof buildTrendOption>, word: string) =>
    lines(option).find((d) => d.label.formatter.startsWith(word));

  it('draws the average at the mean of the complete cycles, named and in border ink', () => {
    const avg = named(buildTrendOption(bars, PALETTE), 'Average');
    expect(avg?.yAxis).toBe(200);
    expect(avg?.label.formatter).toBe('Average ฿200');
    expect(avg?.lineStyle.color).toBe(PALETTE.border);
  });

  it('draws no line at all when there is no average and no budget', () => {
    const thin: TrendBar[] = [{ key: '2026-07', label: 'Jul', value: 50, partial: true }];
    expect(buildTrendOption(thin, PALETTE).series[0].markLine).toBeUndefined();
  });

  it('draws the budget in warn ink at its value when it sits within the bars', () => {
    const b = named(buildTrendOption(bars, PALETTE, 250), 'Budget');
    expect(b?.yAxis).toBe(250);
    expect(b?.label.formatter).toBe('Budget ฿250');
    expect(b?.lineStyle.color).toBe(PALETTE.warn);
  });

  it('clamps a budget above the tallest bar to the bar peak, marked with an arrow', () => {
    // You are well under budget — the line must not vanish off the top nor drag the axis up. It
    // pins to the tallest bar (300) and the label still states the true figure.
    const b = named(buildTrendOption(bars, PALETTE, 30_000), 'Budget');
    expect(b?.yAxis).toBe(300);
    expect(b?.label.formatter).toBe('Budget ฿30,000 ↑');
  });

  it('draws a budget line even with too little history to average', () => {
    const thin: TrendBar[] = [
      { key: '2026-06', label: 'Jun', value: 400, partial: false },
      { key: '2026-07', label: 'Jul', value: 50, partial: true },
    ];
    const option = buildTrendOption(thin, PALETTE, 500);
    expect(named(option, 'Average')).toBeUndefined();
    expect(named(option, 'Budget')?.label.formatter).toBe('Budget ฿500 ↑');
  });

  it('draws no budget line when no budget is given', () => {
    expect(named(buildTrendOption(bars, PALETTE, null), 'Budget')).toBeUndefined();
  });

  it('never sets a y-axis max — not even for a budget far above every bar', () => {
    // THE regression guard, now doubly important: the old budget line forced yAxis.max up to the
    // limit, so a ฿4,899 bar under a ฿30,000 line rendered at 16% height. The budget is a passive
    // overlay now — it is clamped, never allowed to drive the axis. The bars stay scaled to the data.
    expect(buildTrendOption(bars, PALETTE, 30_000).yAxis.max).toBeUndefined();
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

describe('trendSummary', () => {
  const bars: TrendBar[] = [
    { key: '2026-05', label: 'May', value: 100, partial: false },
    { key: '2026-06', label: 'Jun', value: 300, partial: false },
    { key: '2026-07', label: 'Jul', value: 50, partial: true },
  ];

  it('names every figure, so the canvas is not a dead end without sight', () => {
    expect(trendSummary(bars, 'Total spending over the last 3 cycles')).toBe(
      'Total spending over the last 3 cycles: May ฿100, Jun ฿300, Jul ฿50 (cycle in progress). Average ฿200.',
    );
  });

  it('marks the live cycle in words — its 45% opacity says so to nobody else', () => {
    expect(trendSummary(bars, 'x')).toContain('Jul ฿50 (cycle in progress)');
  });

  it('omits the average when there is too little history to have one', () => {
    const thin: TrendBar[] = [{ key: '2026-07', label: 'Jul', value: 50, partial: true }];
    expect(trendSummary(thin, 'x')).toBe('x: Jul ฿50 (cycle in progress).');
  });

  it('states the budget when one is set, so it is not sight-only', () => {
    expect(trendSummary(bars, 'x', 30_000)).toBe(
      'x: May ฿100, Jun ฿300, Jul ฿50 (cycle in progress). Average ฿200. Budget ฿30,000.',
    );
  });

  it('omits the budget sentence when no budget is set', () => {
    expect(trendSummary(bars, 'x', null)).not.toContain('Budget');
  });
});
