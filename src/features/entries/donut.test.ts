import { describe, expect, it } from 'vitest';
import { toDonutSlices, buildDonutOption, donutSummaryLabel, SLICE_COLORS } from './donut';

const row = (key: string, total: number, count = 1) => ({ key, total, count });

describe('toDonutSlices', () => {
  it('maps magnitudes and assigns palette colours in order, carrying the count', () => {
    expect(toDonutSlices([row('a', -30, 5), row('b', -20, 2)])).toEqual([
      { name: 'a', value: 30, color: SLICE_COLORS[0], count: 5 },
      { name: 'b', value: 20, color: SLICE_COLORS[1], count: 2 },
    ]);
  });

  it('buckets the tail beyond the palette into a neutral Other, summing tail counts', () => {
    const rows = Array.from({ length: SLICE_COLORS.length + 3 }, (_, i) =>
      row(`c${i}`, -(20 - i), 2),
    );
    const slices = toDonutSlices(rows);
    expect(slices.length).toBe(SLICE_COLORS.length + 1);
    const other = slices[slices.length - 1];
    expect(other.name).toBe('Other');
    // Other = the 3 tail rows beyond the palette: values 13,12,11 and 2 txns each -> count 6.
    expect(other.value).toBe(13 + 12 + 11);
    expect(other.count).toBe(6);
  });

  it('drops zero-value rows', () => {
    expect(toDonutSlices([row('z', 0), row('a', -5)]).map((s) => s.name)).toEqual(['a']);
  });
});

describe('buildDonutOption', () => {
  const palette = {
    text: '#fff',
    muted: '#999',
    border: '#333',
    surface: '#111',
    surface2: '#1e2128',
    font: 'sans',
    rootPx: 16,
  };

  it('labels the hole with the summed transaction count next to Spent', () => {
    const opt = buildDonutOption([row('a', -30, 5), row('b', -20, 2)], palette);
    expect(opt.graphic[1].style.text).toBe('7 · Spent'); // 5 + 2 transactions
  });

  it('rounds the hole to whole baht — it is a glance figure, not a ledger row', () => {
    // Deliberate: the exact ฿1,354.56 is on the breakdown beside it. The hole stays short.
    const opt = buildDonutOption([row('a', -1234.56, 1), row('b', -120, 1)], palette);
    expect(opt.graphic[0].style.text).toBe('฿1,355');
  });

  it('never renders the hole with a trailing .00 after rounding', () => {
    const opt = buildDonutOption([row('a', -30, 5), row('b', -20, 2)], palette);
    expect(opt.graphic[0].style.text).toBe('฿50');
  });

  // The hole is canvas text, so it ignores the root font-size the rest of the app scales with.
  // Sizes are derived from rootPx instead of hard-coded, so Settings → Text size and browser zoom
  // reach the page's single most important figure.
  it('scales the hole text with the root font size', () => {
    const at16 = buildDonutOption([row('a', -30, 5)], palette);
    expect(at16.graphic[0].style.font).toBe('600 24px sans');
    expect(at16.graphic[1].style.font).toBe('400 13px sans');

    const at24 = buildDonutOption([row('a', -30, 5)], { ...palette, rootPx: 24 });
    expect(at24.graphic[0].style.font).toBe('600 36px sans');
    expect(at24.graphic[1].style.font).toBe('400 19.5px sans');
  });
});

// The donut is a <div role="img">, so everything inside the canvas is invisible to a screen reader.
// The label has to carry the figures the sighted user reads out of the hole, or the total is simply
// unavailable to them.
describe('donutSummaryLabel', () => {
  it('states the total and the transaction count', () => {
    expect(donutSummaryLabel([row('a', -30, 5), row('b', -20, 2)])).toBe(
      'Spending by category: ฿50 across 7 transactions',
    );
  });

  it('singularises a lone transaction', () => {
    expect(donutSummaryLabel([row('a', -30, 1)])).toBe(
      'Spending by category: ฿30 across 1 transaction',
    );
  });

  it('says so plainly when the cycle is empty', () => {
    expect(donutSummaryLabel([])).toBe('Spending by category: nothing spent this cycle');
  });
});
