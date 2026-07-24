import { describe, it, expect } from 'vitest';
import { toHeatmapCells, toCalendarLayout, type HeatmapCell } from './heatmap';
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

  it('crosses a month boundary, both endpoints inclusive', () => {
    const c: Cycle = { key: '2026-01', start: '2026-01-30', end: '2026-02-02', label: 'Jan' };
    const cells = toHeatmapCells([group('2026-01-31', -50)], c);
    expect(cells.map((x) => x.date)).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('rounds a non-quarter ratio UP (Math.ceil, not floor/round)', () => {
    const c: Cycle = { key: '2026-03', start: '2026-03-01', end: '2026-03-02', label: 'Mar' };
    // busiest day 100 → intensity 4; a day at 30% of max → 0.3×4 = 1.2 → ceil = 2 (floor/round = 1)
    const cells = toHeatmapCells([group('2026-03-01', -100), group('2026-03-02', -30)], c);
    const byDate = new Map(cells.map((x) => [x.date, x.intensity]));
    expect(byDate.get('2026-03-01')).toBe(4);
    expect(byDate.get('2026-03-02')).toBe(2);
  });
});

function cell(date: string): HeatmapCell {
  return { date, total: 0, intensity: 0 };
}

describe('toCalendarLayout', () => {
  it('adds no leading blanks when the first day is a Sunday', () => {
    // 2023-01-01 is a Sunday (weekday 0)
    const out = toCalendarLayout([cell('2023-01-01'), cell('2023-01-02')]);
    expect(out[0]?.date).toBe('2023-01-01');
    expect(out.length % 7).toBe(0);
  });

  it('pads leading blanks so the first day lands under its weekday (Sunday-start)', () => {
    // 2026-07-18 is a Saturday (weekday 6) → 6 leading blanks, day lands in the last column
    const out = toCalendarLayout([cell('2026-07-18')]);
    expect(out.slice(0, 6).every((c) => c === null)).toBe(true);
    expect(out[6]?.date).toBe('2026-07-18');
    expect(out.length).toBe(7);
  });

  it('pads trailing blanks so the grid is whole weeks', () => {
    // 2026-07-19 is a Sunday → 0 lead; 3 days → padded up to 7
    const out = toCalendarLayout([cell('2026-07-19'), cell('2026-07-20'), cell('2026-07-21')]);
    expect(out.length).toBe(7);
    expect(out[3]).toBeNull();
    expect(out[6]).toBeNull();
  });

  it('is empty for no cells', () => {
    expect(toCalendarLayout([])).toEqual([]);
  });
});
