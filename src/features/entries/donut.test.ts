import { describe, expect, it } from 'vitest';
import {
  toDonutSlices,
  buildDonutOption,
  donutSummaryLabel,
  drawnTotal,
  SLICE_COLORS,
  MAX_SLICES,
} from './donut';

const row = (key: string, total: number, count = 1) => ({ key, total, count });

// The palette's job is to be non-semantic, and the failure mode is a NEAR miss, not an exact one:
// the first version shipped #7c5cff against an accent of #7132f5 — different hex, same purple to the
// eye — so the biggest category every cycle wore the colour reserved for actions and selection.
// Comparing hex strings would not have caught that, so this measures hue distance in OKLCH.
function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
}
describe('SLICE_COLORS', () => {
  // Kept in step with globals.css @theme by hand — these are the tokens a slice must never imitate.
  const RESERVED = { accent: '#7132f5', gain: '#19c37d', loss: '#f0616d' };

  it.each(Object.entries(RESERVED))('never impersonates --color-%s', (_name, token) => {
    const reserved = hueOf(token);
    for (const slice of SLICE_COLORS) {
      const d = Math.abs(hueOf(slice) - reserved) % 360;
      expect(Math.min(d, 360 - d)).toBeGreaterThan(25);
    }
  });
});

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

  // Other is the one slice with no way in: a ring can't fragment into 15 slivers, so the tail folds.
  // But the fold used to be a dead end — on a real ledger that bucket was 16% of the cycle and 15
  // transactions the reader could not reach from this view, while the ranked list beside it already
  // opened its tail behind a <details>. Carrying the folded rows on the bucket lets the legend offer
  // the same disclosure, so both views reach every category.
  describe('folded', () => {
    it('carries the categories it merged, in rank order', () => {
      const rows = Array.from({ length: SLICE_COLORS.length + 3 }, (_, i) =>
        row(`c${i}`, -(20 - i), 2),
      );
      const other = toDonutSlices(rows).at(-1);
      expect(other?.folded?.map((f) => f.name)).toEqual(['c7', 'c8', 'c9']);
      expect(other?.folded?.map((f) => f.value)).toEqual([13, 12, 11]);
    });

    it('folds rows sum to the bucket, so disclosing them adds no new money', () => {
      const rows = Array.from({ length: SLICE_COLORS.length + 4 }, (_, i) =>
        row(`c${i}`, -(20 - i), 3),
      );
      const other = toDonutSlices(rows).at(-1);
      const folded = other?.folded ?? [];
      expect(folded.reduce((sum, f) => sum + f.value, 0)).toBe(other?.value);
      expect(folded.reduce((sum, f) => sum + f.count, 0)).toBe(other?.count);
    });

    it('gives folded rows the bucket colour — they ARE the grey wedge, not slices of their own', () => {
      const rows = Array.from({ length: SLICE_COLORS.length + 2 }, (_, i) =>
        row(`c${i}`, -(20 - i)),
      );
      const other = toDonutSlices(rows).at(-1);
      for (const f of other?.folded ?? []) expect(f.color).toBe(other?.color);
      // ...and they stay real categories: editable and tappable, unlike the synthetic bucket.
      for (const f of other?.folded ?? []) expect(f.other).toBeUndefined();
    });

    it('is absent when nothing folded — no empty disclosure to open', () => {
      const slices = toDonutSlices([row('a', -30), row('b', -20)]);
      expect(slices.some((s) => s.other)).toBe(false);
      for (const s of slices) expect(s.folded).toBeUndefined();
    });
  });
});

describe('buildDonutOption', () => {
  const palette = {
    text: '#fff',
    muted: '#999',
    surface: '#111',
    font: 'sans',
    rootPx: 16,
  };

  // The hole sits directly under a panel that already reads "Spent this cycle ฿63,295". The count is
  // the one thing that panel does NOT say, so the hole names it — and only it.
  it('fills the hole with the summed transaction count', () => {
    const opt = buildDonutOption([row('a', -30, 5), row('b', -20, 2)], palette);
    expect(opt.graphic[0].style.text).toBe('7'); // 5 + 2
    expect(opt.graphic[1].style.text).toBe('transactions');
  });

  it('says transaction, singular, when there is only one', () => {
    const opt = buildDonutOption([row('a', -30, 1)], palette);
    expect(opt.graphic[0].style.text).toBe('1');
    expect(opt.graphic[1].style.text).toBe('transaction');
  });

  it('groups a four-figure count', () => {
    const opt = buildDonutOption([row('a', -30, 1200), row('b', -20, 34)], palette);
    expect(opt.graphic[0].style.text).toBe('1,234');
  });

  // The regression this guards: Chart view used to print the cycle total twice — once in the panel
  // above the toggle, once in the ring's hole — so the same string appeared twice on one screen.
  // The panel is the constant across both views, so the ring is the one that gives it up.
  it('keeps money out of the hole entirely', () => {
    const opt = buildDonutOption([row('a', -1234.56, 1), row('b', -120, 1)], palette);
    for (const g of opt.graphic) expect(g.style.text).not.toContain('฿');
  });

  // The hole is canvas text, so it ignores the root font-size the rest of the app scales with.
  // Sizes are derived from rootPx instead of hard-coded, so Settings → Text size and browser zoom
  // reach the hole along with everything else.
  it('scales the hole text with the root font size', () => {
    const at16 = buildDonutOption([row('a', -30, 5)], palette);
    expect(at16.graphic[0].style.font).toBe('600 18px sans');
    expect(at16.graphic[1].style.font).toBe('400 13px sans');

    const at24 = buildDonutOption([row('a', -30, 5)], { ...palette, rootPx: 24 });
    expect(at24.graphic[0].style.font).toBe('600 27px sans');
    expect(at24.graphic[1].style.font).toBe('400 19.5px sans');
  });

  // The hierarchy guard. The hole sits dead centre of a big ring with whitespace all round it, which
  // amplifies whatever it holds — so what it holds has to earn that. It holds the TRANSACTION COUNT,
  // and the count is the least valuable figure on the page: Home exists to answer "where did my money
  // go this cycle?", and the answer is ฿34,754, not "57".
  //
  // 1908419 moved the total out of the hole (it was being said twice) but left the count wearing the
  // 1.5rem/600/full-ink type the total had vacated, so the page's loudest, highest-contrast, most
  // central number became its least useful one. Both lines are muted now and the count is under the
  // 1.25rem headline it sits below, so the hole reads as the annotation it is and ฿34,754 is
  // unambiguously the page's biggest figure. Keep the count strictly smaller than that headline.
  it('keeps the hole subordinate to the headline total', () => {
    const opt = buildDonutOption([row('a', -30, 5)], palette);
    const px = /(\d+(?:\.\d+)?)px/.exec(opt.graphic[0].style.font);
    expect(px).not.toBeNull();
    const countPx = Number(px?.[1]);
    // .text-xl — the "Spent this cycle" figure in the panel above the ring.
    expect(countPx).toBeLessThan(1.25 * palette.rootPx);
    // Neither line wears full ink; the ring itself carries the panel's visual weight.
    expect(opt.graphic[0].style.fill).toBe(palette.muted);
    expect(opt.graphic[1].style.fill).toBe(palette.muted);
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

describe('toDonutSlices with inflows', () => {
  it('nets a refund against its own category', () => {
    // sum(amount) for Food is -2000 + 500 = -1500
    const slices = toDonutSlices([row('Food', -1500, 2)]);
    expect(slices).toHaveLength(1);
    expect(slices[0].value).toBe(1500);
  });

  it('drops a category whose refunds exceed its spend rather than drawing it as spending', () => {
    // A refund landing in a later cycle than the spend it refunds: Food nets POSITIVE.
    // Math.abs would have drawn a +400 wedge — spending that never happened.
    const slices = toDonutSlices([row('Rent', -9000, 1), row('Food', 400, 1)]);
    expect(slices.map((s) => s.name)).toEqual(['Rent']);
  });
});

describe('drawnTotal', () => {
  it('sums the values the ring actually drew', () => {
    const slices = toDonutSlices([row('a', -30, 5), row('b', -20, 2)]);
    expect(drawnTotal(slices)).toBe(50);
  });

  it('excludes a category whose refunds outweighed its spend, so shares can total 100', () => {
    // 'c' netted positive (a refund), so toDonutSlices drops it. The denominator must drop it
    // too: dividing a drawn magnitude by the signed net is what produced 109% on Home.
    const slices = toDonutSlices([row('a', -30, 5), row('b', -20, 2), row('c', 8, 1)]);
    const net = -(-30 + -20 + 8);
    expect(drawnTotal(slices)).toBe(50);
    expect(drawnTotal(slices)).not.toBe(net);
    const shares = slices.map((s) => Math.round((s.value / drawnTotal(slices)) * 100));
    expect(shares.reduce((sum, s) => sum + s, 0)).toBe(100);
  });

  it('counts the Other bucket, which is drawn like any other wedge', () => {
    const rows = Array.from({ length: MAX_SLICES + 2 }, (_, i) => row(`c${i}`, -10, 1));
    expect(drawnTotal(toDonutSlices(rows))).toBe((MAX_SLICES + 2) * 10);
  });

  it('is zero for an empty ring', () => {
    expect(drawnTotal([])).toBe(0);
  });
});
