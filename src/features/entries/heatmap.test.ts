import { describe, it, expect } from 'vitest';
import { toHeatmapCells } from './heatmap';
import type { DayGroup } from './by-date';
import type { Cycle } from './cycle';

// Cycle is exactly `{ key: string; start: string; end: string; label: string }` (from cycle.ts).
// Fully-typed literal — NO `as` (lint bans it).
const cycle: Cycle = { key: '2026-07', start: '2026-07-01', end: '2026-07-05', label: 'Jul' };

function group(date: string, total: number): DayGroup {
  return { date, total, entries: [] };
}

describe('toHeatmapCells', () => {
  it('emits one cell per day in the cycle, empty days as zero', () => {
    const cells = toHeatmapCells([group('2026-07-02', -100)], cycle);
    expect(cells.map((c) => c.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ]);
    expect(cells[0]).toEqual({ date: '2026-07-01', total: 0, intensity: 0 });
  });

  it("buckets intensity 1..4 against the cycle's busiest day, 0 for empty", () => {
    const cells = toHeatmapCells(
      [group('2026-07-01', -100), group('2026-07-02', -25), group('2026-07-03', -50)],
      cycle,
    );
    const byDate = new Map(cells.map((c) => [c.date, c.intensity]));
    expect(byDate.get('2026-07-01')).toBe(4); // busiest
    expect(byDate.get('2026-07-02')).toBe(1); // 25% of max
    expect(byDate.get('2026-07-03')).toBe(2); // 50% of max
    expect(byDate.get('2026-07-04')).toBe(0); // empty
  });
});
