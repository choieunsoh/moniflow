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
const MAX_SLICES = SLICE_COLORS.length;

export type DonutSlice = { name: string; value: number; color: string; count: number };

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
    });
  }
  return slices;
}

// Colours + font are injected (read from CSS tokens / computed style by the wrapper) so this stays
// pure and theme-aware without importing echarts or touching the DOM.
export type DonutPalette = {
  text: string;
  muted: string;
  border: string;
  surface: string;
  font: string;
};

function baht(v: number): string {
  return `฿${new Intl.NumberFormat('en-US').format(Math.round(v))}`;
}

// Returns a plain ECharts option: a doughnut of spending-by-category with the total spent rendered in
// the hole (two graphic texts, since a canvas center label can't be a CSS-styled element). The label
// line carries the transaction count too — "62 · Spent" — summed from the slices (incl. Other).
export function buildDonutOption(rows: Breakdown[], p: DonutPalette) {
  const slices = toDonutSlices(rows);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const count = slices.reduce((sum, s) => sum + s.count, 0);
  const spentLabel = `${new Intl.NumberFormat('en-US').format(count)} · Spent`;
  return {
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1e2128',
      borderColor: p.border,
      borderWidth: 1,
      textStyle: { color: p.text, fontFamily: 'inherit' },
      valueFormatter: (v: number) => baht(v),
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '42%',
        style: { text: baht(total), fill: p.text, font: `600 24px ${p.font}`, textAlign: 'center' },
      },
      {
        type: 'text',
        left: 'center',
        top: '56%',
        style: { text: spentLabel, fill: p.muted, font: `400 13px ${p.font}`, textAlign: 'center' },
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
