import { formatBahtWhole } from '@shared/money';
import type { Cycle } from './cycle';

// The analytics window: six cycles fit at 412px with readable month labels, and six is enough to
// read a trend without the chart turning into noise.
export const TREND_CYCLES = 6;

const monthFmt = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

// A cycle key ('2026-07') is anchored to its START month, so the axis label is that month's short
// name. Six-cycle windows never repeat a month, so the year is left off to keep the axis light.
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

// `partial` marks the live cycle — it is still filling up, so the chart must not present it as
// comparable to the finished ones. Keyed off the current cycle, NOT "the last bar": a window
// anchored to a past cycle is complete all the way to its right edge.
export type TrendBar = { key: string; label: string; value: number; partial: boolean };

// Window + per-cycle spend magnitudes → bars in window order. A cycle with no spend is a real zero
// (you spent nothing), not a gap, so it stays in the series.
export function toTrendBars(
  cycles: Cycle[],
  spendByCycle: Map<string, number>,
  currentKey: string,
): TrendBar[] {
  return cycles.map((c) => ({
    key: c.key,
    label: monthLabel(c.key),
    value: spendByCycle.get(c.key) ?? 0,
    partial: c.key === currentKey,
  }));
}

// Colours + font are injected (read from CSS tokens / computed style by the wrapper) so this stays
// pure and theme-aware without importing echarts or touching the DOM. Mirrors DonutPalette's
// contract; kept separate because a bar chart wants an accent and has no slice surface to border.
export type TrendPalette = {
  text: string;
  muted: string;
  border: string;
  accent: string;
  font: string;
};

// The anchor (last bar) is the cycle you selected — it carries the accent so the eye lands on
// "now" and reads the rest as context. Everything else is muted. A partial cycle is faded on top
// of that, whichever bar it is.
function barItemStyle(bar: TrendBar, anchorKey: string, p: TrendPalette) {
  const isAnchor = bar.key === anchorKey;
  return {
    color: isAnchor ? p.accent : p.muted,
    opacity: bar.partial ? 0.45 : isAnchor ? 1 : 0.55,
    borderRadius: [4, 4, 0, 0],
  };
}

// Returns a plain ECharts option: one bar per cycle, oldest → newest. The y axis is hidden — the
// tooltip and the list below carry the figures, and an axis of baht labels would crowd a 412px
// column for no gain.
export function buildTrendOption(bars: TrendBar[], p: TrendPalette) {
  const anchorKey = bars.length > 0 ? bars[bars.length - 1].key : '';
  return {
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e2128',
      borderColor: p.border,
      borderWidth: 1,
      textStyle: { color: p.text, fontFamily: 'inherit' },
      valueFormatter: (v: number) => formatBahtWhole(v),
    },
    xAxis: {
      type: 'category',
      data: bars.map((b) => b.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: p.border } },
      axisLabel: { color: p.muted, fontFamily: p.font, fontSize: 12 },
    },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'bar',
        barMaxWidth: 32,
        data: bars.map((b) => ({
          name: b.label,
          value: b.value,
          itemStyle: barItemStyle(b, anchorKey, p),
        })),
      },
    ],
  };
}
