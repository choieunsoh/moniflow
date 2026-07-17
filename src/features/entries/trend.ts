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

// The average's basis: complete cycles that have spend. Two exclusions, each for a reason the
// chart already accepts.
//
// The live cycle, because `partial` exists precisely to stop an unfinished cycle being compared as
// if it were finished — and an average IS a comparison. On day 2 of the cycle you have spent ฿400
// of a typical ฿5,000; count it and the line sags for the rest of the month.
//
// Zero cycles, because `toTrendBars` deliberately renders "no data" and "spent nothing" as the same
// real zero (a gap would read as a rendering bug). That is right for bars and wrong for an average:
// if the ledger starts in May, the window's earlier zeros mean "not tracking yet", and averaging
// them in drags the line low enough to report every real cycle as above-normal.
//
// ponytail: `value > 0` cannot tell a genuine zero-spend complete cycle from a pre-tracking one, and
// excludes both — nudging the average up. In a single-user tracker a real zero-spend month means you
// did not open the app, so excluding it is the safer error. Upgrade path if that ever bites: a
// `min(date)` query against entries to find where tracking actually began.
export function completeBars(bars: TrendBar[]): TrendBar[] {
  return bars.filter((b) => !b.partial && b.value > 0);
}

// Null below two complete cycles: one cycle has no "normal" to compare against, and a line sitting
// exactly on your only bar is noise. The caller says why instead of drawing it.
export function trendAverage(bars: TrendBar[]): number | null {
  const basis = completeBars(bars);
  if (basis.length < 2) return null;
  return basis.reduce((sum, b) => sum + b.value, 0) / basis.length;
}

// Colours + font are injected (read from CSS tokens / computed style by the wrapper) so this stays
// pure and theme-aware without importing echarts or touching the DOM. Mirrors DonutPalette's
// contract; kept separate because a bar chart wants an accent and has no slice surface to border.
export type TrendPalette = {
  text: string;
  muted: string;
  border: string;
  surface2: string;
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
// column for no gain. A dashed line marks your own average across the window (see trendAverage);
// below two complete cycles there is nothing to average and no line is drawn.
export function buildTrendOption(bars: TrendBar[], p: TrendPalette) {
  const anchorKey = bars.length > 0 ? bars[bars.length - 1].key : '';
  const average = trendAverage(bars);
  return {
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'item',
      backgroundColor: p.surface2,
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
    // No `max`. The budget line forced the axis up to a limit that could sit far above every bar,
    // which shortened every bar in proportion to how far under budget you were — the same mechanism
    // that got the budgets view deleted. An average is always inside the data's range, so it cannot
    // be clipped and the axis never needs forcing. Do not reintroduce a reference that lives outside
    // the data without solving this again.
    // `max: undefined` (not omitted) keeps the field statically visible so the regression test
    // above can assert on it — TS infers object-literal shape from what's written, and a field
    // that's never present can't be asserted `undefined` without a cast.
    yAxis: { type: 'value', show: false, max: undefined },
    series: [
      {
        type: 'bar',
        barMaxWidth: 32,
        data: bars.map((b) => ({
          name: b.label,
          value: b.value,
          itemStyle: barItemStyle(b, anchorKey, p),
        })),
        markLine:
          average === null
            ? undefined
            : {
                silent: true,
                symbol: 'none',
                data: [{ yAxis: average }],
                // border, not muted: muted is every non-anchor bar's colour, so the line and the
                // data would share one ink and the reference would read as another bar.
                lineStyle: { color: p.border, type: 'dashed', width: 1 },
                label: {
                  formatter: `Average ${formatBahtWhole(average)}`,
                  position: 'insideEndTop',
                  color: p.muted,
                  fontFamily: p.font,
                  fontSize: 11,
                },
              },
      },
    ],
  };
}
