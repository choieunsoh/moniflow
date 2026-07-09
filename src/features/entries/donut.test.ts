import { describe, expect, it } from 'vitest';
import { toDonutSlices, SLICE_COLORS } from './donut';

const row = (key: string, total: number) => ({ key, total });

describe('toDonutSlices', () => {
  it('maps magnitudes and assigns palette colours in order', () => {
    expect(toDonutSlices([row('a', -30), row('b', -20)])).toEqual([
      { name: 'a', value: 30, color: SLICE_COLORS[0] },
      { name: 'b', value: 20, color: SLICE_COLORS[1] },
    ]);
  });

  it('buckets the tail beyond the palette into a neutral Other', () => {
    const rows = Array.from({ length: SLICE_COLORS.length + 3 }, (_, i) => row(`c${i}`, -(20 - i)));
    const slices = toDonutSlices(rows);
    expect(slices.length).toBe(SLICE_COLORS.length + 1);
    const other = slices[slices.length - 1];
    expect(other.name).toBe('Other');
    // Other = sum of the 4 tail rows (values 20-7 .. 20-9 = 13,12,11) -> the last 3 after 7 kept.
    expect(other.value).toBe(13 + 12 + 11);
  });

  it('drops zero-value rows', () => {
    expect(toDonutSlices([row('z', 0), row('a', -5)]).map((s) => s.name)).toEqual(['a']);
  });
});
