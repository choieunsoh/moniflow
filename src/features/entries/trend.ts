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

// /month's axis: every cycle in that window shares one month, so the month name would repeat all
// the way across and identify nothing. The year is what varies, so the year is the label.
export function yearLabel(key: string): string {
  return key.split('-')[0];
}

// A 1-based month number as its full name — /month's page title and its stepper's labels, where
// "July" is the subject rather than an axis tick. Any year works; only the month is read.
const monthNameFmt = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });

export function monthName(month: number): string {
  return monthNameFmt.format(new Date(Date.UTC(2000, month - 1, 1)));
}

// The month before or after, WRAPPING — the calendar is a ring, so December steps to January and
// there is no boundary. Shared by MonthSelector (which needs the neighbours for its labels) and
// /month (which needs them for the hrefs): two copies of this would let the arrow announce "Next
// month: January" while sending you somewhere else.
export function stepMonth(month: number, delta: -1 | 1): number {
  return ((month - 1 + delta + 12) % 12) + 1;
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
  // How a cycle key becomes an axis label. Defaults to the month name, which is right for every
  // window that walks forward through months; /month passes yearLabel because its window holds one
  // month across many years.
  label: (key: string) => string = monthLabel,
): TrendBar[] {
  return cycles.map((c) => ({
    key: c.key,
    label: label(c.key),
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

// The chart's accessible text. ECharts draws to canvas and its tooltip is trigger:'item' — pointer
// only — so without this every figure the page exists to communicate is unreachable by keyboard or
// screen reader. The old aria-label was the chart's TITLE ("Total spending over the last 6 cycles"),
// which names the chart and states none of its data.
export function trendSummary(
  bars: TrendBar[],
  prefix: string,
  budget: number | null = null,
): string {
  const figures = bars
    .map((b) => `${b.label} ${formatBahtWhole(b.value)}${b.partial ? ' (cycle in progress)' : ''}`)
    .join(', ');
  const average = trendAverage(bars);
  const averageSentence = average === null ? '' : ` Average ${formatBahtWhole(average)}.`;
  const budgetSentence = budget === null ? '' : ` Budget ${formatBahtWhole(budget)}.`;
  return `${prefix}: ${figures}.${averageSentence}${budgetSentence}`;
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
  warn: string;
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
//
// Two dashed reference lines, each labelled and inked so neither reads as a stray bar:
//   • AVERAGE (border ink) — your own mean across the window (see trendAverage); answers "is this
//     normal for me". Omitted below two complete cycles, where there is nothing to average.
//   • BUDGET (warn ink) — your limit for what the chart shows (the caller passes the total budget
//     unfiltered, that category's limit when filtered). Answers "which cycles blew it".
// The budget is a PASSIVE overlay: it is drawn at min(budget, tallest bar) and NEVER touches the
// axis. That is the whole point — the old budget line forced yAxis.max up to the limit, squashing
// every bar in proportion to how far under budget you were (a ฿4,899 bar at 16% height under a
// ฿30,000 line). When the budget sits above the tallest bar you are comfortably under it, so the
// marker pins to the bar peak and the label carries an ↑ plus the true figure — "your budget is up
// here, unreached" — rather than vanishing off the top or dragging the axis.
export function buildTrendOption(bars: TrendBar[], p: TrendPalette, budget: number | null = null) {
  const anchorKey = bars.length > 0 ? bars[bars.length - 1].key : '';
  const average = trendAverage(bars);
  const barMax = Math.max(0, ...bars.map((b) => b.value));

  const refLines = [];
  if (average !== null) {
    refLines.push({
      yAxis: average,
      // border, not muted: muted is every non-anchor bar's colour, so the line and the data would
      // share one ink and the reference would read as another bar.
      lineStyle: { color: p.border, type: 'dashed', width: 1 },
      label: {
        formatter: `Average ${formatBahtWhole(average)}`,
        position: 'insideStartTop',
        color: p.muted,
        fontFamily: p.font,
        fontSize: 11,
      },
    });
  }
  if (budget !== null && budget > 0) {
    const overTop = budget > barMax;
    refLines.push({
      yAxis: overTop ? barMax : budget,
      lineStyle: { color: p.warn, type: 'dashed', width: 1 },
      label: {
        formatter: `Budget ${formatBahtWhole(budget)}${overTop ? ' ↑' : ''}`,
        position: 'insideEndTop',
        color: p.warn,
        fontFamily: p.font,
        fontSize: 11,
      },
    });
  }

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
    // No `max`, EVER — the axis is scaled to the bars alone. Both reference lines respect this: the
    // average is always inside the data's range, and the budget is clamped to the bar peak (see the
    // header comment) rather than allowed to force the axis. Forcing the axis to reach a distant
    // budget is exactly what squashed the bars and got the old budget line removed; do not bring it
    // back. `max: undefined` (not omitted) keeps the field statically visible so the regression test
    // can assert on it — TS infers object-literal shape from what's written, and a field that is
    // never present can't be asserted `undefined` without a cast.
    // `axisLabel: { show: false }` is NOT redundant next to `show: false`. containLabel above
    // reserves gutter for each axis's LABELS, and axisLabel.show defaults to true independently of
    // axis.show — so the hidden y-axis was still claiming ~50px of a 323px chart, pushing every bar
    // right and costing ~15% of the plot. containLabel has to stay for the x-axis labels, so the
    // y-axis labels are silenced explicitly instead. See the regression test.
    yAxis: { type: 'value', show: false, axisLabel: { show: false }, max: undefined },
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
          refLines.length === 0 ? undefined : { silent: true, symbol: 'none', data: refLines },
      },
    ],
  };
}
