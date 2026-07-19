import { formatBahtWhole } from '@shared/money';
import type { Breakdown } from './queries';

// Calm, non-semantic categorical palette for the spending donut. Deliberately avoids the gain-green
// and loss-red value colours so a slice's colour never reads as a sign (data-honesty). The ranked
// legend carries the names, so slices only need to be mutually distinguishable, not meaningful.
export const SLICE_COLORS = [
  '#7c5cff',
  '#5b8def',
  '#3fb6a8',
  '#e0a13c',
  '#d16ba5',
  '#6a7bd8',
  '#86b34a',
] as const;
const OTHER_COLOR = '#4b5061';
// How many categories the ring names before the rest fold into Other. Exported because the ranked
// list folds at the SAME point: the two views are one dataset rendered twice, and a toggle that
// changed the visible category count (8 vs 19) was changing the answer, not the visualisation.
export const MAX_SLICES = SLICE_COLORS.length;

// `other: true` marks the synthetic tail bucket — not a real category, so the legend must not offer
// to edit it. Real slices omit the field.
export type DonutSlice = {
  name: string;
  value: number;
  color: string;
  count: number;
  other?: boolean;
};

// Category breakdown (magnitudes, already sorted desc) → donut slices, with a neutral "Other" bucket
// for the tail beyond the palette so the ring never fragments into unreadable slivers. Each slice
// carries its transaction count; Other sums the counts of the merged tail categories (the legend
// can't derive that itself, since only this split knows which categories were folded in).
export function toDonutSlices(rows: Breakdown[]): DonutSlice[] {
  const mags = rows
    .map((r) => ({ name: r.key, value: Math.abs(r.total), count: r.count }))
    .filter((s) => s.value > 0);
  const slices: DonutSlice[] = mags
    .slice(0, MAX_SLICES)
    .map((s, i) => ({ ...s, color: SLICE_COLORS[i] }));
  const rest = mags.slice(MAX_SLICES);
  if (rest.length > 0) {
    slices.push({
      name: 'Other',
      value: rest.reduce((sum, s) => sum + s.value, 0),
      color: OTHER_COLOR,
      count: rest.reduce((sum, s) => sum + s.count, 0),
      other: true,
    });
  }
  return slices;
}

// Colours + font are injected (read from CSS tokens / computed style by the wrapper) so this stays
// pure and theme-aware without importing echarts or touching the DOM. `rootPx` is the resolved root
// font-size: canvas text can't inherit rem, so the hole's sizes are derived from it rather than
// hard-coded, which is what makes Settings → Text size and browser zoom reach the centre figure.
export type DonutPalette = {
  text: string;
  muted: string;
  surface: string;
  font: string;
  rootPx: number;
};

// The hole's two lines, as multiples of the root font-size (1.5rem / 0.8125rem at the 16px default).
const TOTAL_REM = 1.5;
const LABEL_REM = 0.8125;

// The donut renders into a canvas inside a <div role="img">, so a screen reader gets the label and
// nothing else — the total has to live in the label itself or it doesn't exist for that user. Mirrors
// what the hole shows: the rounded total and the transaction count behind it.
export function donutSummaryLabel(rows: Breakdown[], label = 'Spending by category'): string {
  const slices = toDonutSlices(rows);
  if (slices.length === 0) return `${label}: nothing spent this cycle`;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const count = slices.reduce((sum, s) => sum + s.count, 0);
  const noun = count === 1 ? 'transaction' : 'transactions';
  return `${label}: ${formatBahtWhole(total)} across ${count} ${noun}`;
}

// Returns a plain ECharts option: a doughnut of spending-by-category with the total spent rendered in
// the hole (two graphic texts, since a canvas center label can't be a CSS-styled element). The label
// line carries the transaction count too — "62 · Spent" — summed from the slices (incl. Other).
export function buildDonutOption(rows: Breakdown[], p: DonutPalette) {
  const slices = toDonutSlices(rows);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const count = slices.reduce((sum, s) => sum + s.count, 0);
  // "22 transactions", not the old "22 · Spent". The panel directly above the ring already reads
  // "Spent this cycle ฿63,295", so repeating "Spent" said nothing new and left the hole ending on a
  // fragment. The count is the one figure that panel does NOT carry, so the hole names it in full —
  // and the two lines now answer different questions instead of the same one twice.
  const spentLabel = `${new Intl.NumberFormat('en-US').format(count)} ${
    count === 1 ? 'transaction' : 'transactions'
  }`;
  // No tooltip: the canvas is pointer-events-none so a swipe over the ring reaches the cycle-swipe
  // wrapper (see DonutChart), which means a tooltip could never be triggered by mouse or touch. It
  // was configured for years and never once fired. The legend below the ring carries the same
  // figures, which is what makes the ring affordable to make inert in the first place.
  return {
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '42%',
        style: {
          text: formatBahtWhole(total),
          fill: p.text,
          font: `600 ${p.rootPx * TOTAL_REM}px ${p.font}`,
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '56%',
        style: {
          text: spentLabel,
          fill: p.muted,
          font: `400 ${p.rootPx * LABEL_REM}px ${p.font}`,
          textAlign: 'center',
        },
      },
    ],
    series: [
      {
        type: 'pie',
        radius: ['62%', '92%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: p.surface, borderWidth: 2 },
        data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
      },
    ],
  };
}
