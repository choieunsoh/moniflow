import { describe, expect, it } from 'vitest';
import { toDonutSlices, buildDonutOption, SLICE_COLORS } from './donut';

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
  const palette = { text: '#fff', muted: '#999', border: '#333', surface: '#111', font: 'sans' };

  it('labels the hole with the summed transaction count next to Spent', () => {
    const opt = buildDonutOption([row('a', -30, 5), row('b', -20, 2)], palette);
    expect(opt.graphic[1].style.text).toBe('7 · Spent'); // 5 + 2 transactions
  });
});
