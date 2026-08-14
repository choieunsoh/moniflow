import { formatBahtWhole } from '@shared/money';
import type { Breakdown } from './queries';

// Calm, non-semantic categorical palette for the spending donut. Three hue bands are reserved and
// the ramp steers clear of all of them: gain-green and loss-red (a slice must never read as a sign),
// and — the one the first version missed — the ACCENT itself. The old slot 0 was #7c5cff against an
// accent of #7132f5, so the biggest category every cycle wore the same purple as the FAB, the active
// toggle and the selected tab, which is exactly what DESIGN.md forbids ("accent … never for
// decoration"). Every hue here sits >=38 degrees off the accent and >=26 off gain/loss.
//
// Derived, not eyeballed: searched over the OKLCH dark band (L 0.48-0.67, chroma capped at 0.15 to
// stay calm) and ordered to maximise the worst ADJACENT pair, then checked with the dataviz
// validator. Worst adjacent separation is now CVD dE 13.7 (floor 8) and normal-vision dE 25.0
// (floor 15); the previous ramp FAILED both, with #86b34a/#e0a13c at dE 1.4 for protanopia — olive
// and amber were the same colour to a red-blind reader.
//
// Validated on the ADJACENT pairlist, not all-pairs: only four hues can clear all-pairs once the
// three bands are reserved, and capping the ring at four categories is a worse trade than this.
// It holds because the legend never leans on colour alone — every LegendRow carries the category
// glyph, name, count, amount and share, so a wedge is identifiable without matching its hue.
export const SLICE_COLORS = [
  '#03999d',
  '#da7134',
  '#08a1cc',
  '#b6770b',
  '#2f8adc',
  '#709517',
  '#be5ea5',
] as const;
const OTHER_COLOR = '#4b5061';
// How many categories the ring names before the rest fold into Other. Exported because the ranked
// list folds at the SAME point: the two views are one dataset rendered twice, and a toggle that
// changed the visible category count (8 vs 19) was changing the answer, not the visualisation.
export const MAX_SLICES = SLICE_COLORS.length;

// `other: true` marks the synthetic tail bucket — not a real category, so the legend must not offer
// to edit it. Real slices omit the field.
//
// `folded` rides on that bucket alone: the real categories it merged, in rank order. Only this split
// knows which they were, and without them Other is a dead end — on a long-tailed cycle it can be a
// sixth of the spend and a dozen transactions with no way in, while the ranked list beside it opens
// its identical tail behind a <details>. Handing them back lets the legend offer the same disclosure.
export type DonutSlice = {
  name: string;
  value: number;
  color: string;
  count: number;
  other?: boolean;
  folded?: DonutSlice[];
};

// Category breakdown (magnitudes, already sorted desc) → donut slices, with a neutral "Other" bucket
// for the tail beyond the palette so the ring never fragments into unreadable slivers. Each slice
// carries its transaction count; Other sums the counts of the merged tail categories (the legend
// can't derive that itself, since only this split knows which categories were folded in).
export function toDonutSlices(rows: Breakdown[]): DonutSlice[] {
  // ponytail: a ring cannot draw a negative wedge, so a category whose refunds exceed its spend is
  // dropped by the filter below rather than shown as a credit. The budget meter still carries the
  // true negative, so the two disagree by exactly the amount that could not be drawn. Give the ring
  // a signed centre figure if that ever misleads.
  const mags = rows
    .map((r) => ({ name: r.key, value: -r.total, count: r.count }))
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
      // The bucket's own colour, not a palette slot: these categories have no wedge of their own —
      // they ARE the grey one — and giving them a slice colour would key the legend to a ring that
      // never drew them. Same reasoning that keeps unmapped Breakdown bars neutral. They stay real
      // categories otherwise (no `other` flag), so each is still editable and still taps through to
      // its records.
      folded: rest.map((s) => ({ ...s, color: OTHER_COLOR })),
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

// The hole's two lines, as multiples of the root font-size (1.125rem / 0.8125rem at the 16px
// default). The count is deliberately SMALLER than the .text-xl (1.25rem) total in the panel above
// the ring: dead centre of a big ring with whitespace all round is the loudest slot on the page, and
// a transaction count is the quietest thing on it. Home answers "where did my money go this cycle?"
// — the answer is the baht figure, and the hole must not out-shout it. See the hierarchy test.
const COUNT_REM = 1.125;
const LABEL_REM = 0.8125;

// The donut renders into a canvas inside a <div role="img">, so a screen reader gets the label and
// nothing else — the total has to live in the label itself or it doesn't exist for that user. This
// intentionally says MORE than the hole now draws: the hole drops the money to avoid printing it
// twice on a screen someone takes in at a glance, but an image description is read in isolation, so
// it still names both figures.
export function donutSummaryLabel(rows: Breakdown[], label = 'Spending by category'): string {
  const slices = toDonutSlices(rows);
  if (slices.length === 0) return `${label}: nothing spent this cycle`;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const count = slices.reduce((sum, s) => sum + s.count, 0);
  const noun = count === 1 ? 'transaction' : 'transactions';
  return `${label}: ${formatBahtWhole(total)} across ${count} ${noun}`;
}

// Returns a plain ECharts option: a doughnut of spending-by-category with the cycle's TRANSACTION
// COUNT rendered in the hole (two graphic texts, since a canvas center label can't be a CSS-styled
// element).
//
// The hole deliberately does not carry the money. Dropping "Spent" from the label line was half the
// fix — the figure itself was still the other half, so Chart view printed the identical string
// ("฿34,754") twice about 250px apart: once in the panel above the toggle, once here. The panel is
// the constant across both views (List has no ring to put it in), which makes the ring the copy, not
// the original. So the hole now names the one figure that panel does NOT carry, and the total
// appears exactly once per screen.
export function buildDonutOption(rows: Breakdown[], p: DonutPalette) {
  const slices = toDonutSlices(rows);
  const count = slices.reduce((sum, s) => sum + s.count, 0);
  const countText = new Intl.NumberFormat('en-US').format(count);
  const countLabel = count === 1 ? 'transaction' : 'transactions';
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
          text: countText,
          // Muted, not full ink, for the same reason it's small: this is an annotation on the ring,
          // not the page's answer. Both hole lines sit at muted so the pair reads as one caption.
          fill: p.muted,
          font: `600 ${p.rootPx * COUNT_REM}px ${p.font}`,
          textAlign: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '56%',
        style: {
          text: countLabel,
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
