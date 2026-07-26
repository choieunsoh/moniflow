import { describe, it, expect } from 'vitest';
import { foldCategoryReport, type ReportPeriod } from './category-report';
import type { BreakdownMatrix } from './breakdown-matrix';

// [category]: [value, count] per period key — the matrix the db builder produces, hand-written so
// the fold is tested without a database.
function matrixOf(spec: Record<string, Record<string, [number, number]>>): BreakdownMatrix {
  const matrix: BreakdownMatrix = new Map();
  for (const [key, byCategory] of Object.entries(spec)) {
    const inner = new Map<string, { value: number; count: number }>();
    for (const [name, [value, count]] of Object.entries(byCategory))
      inner.set(name, { value, count });
    matrix.set(key, inner);
  }
  return matrix;
}

const PERIODS: ReportPeriod[] = [
  { key: '2026-01', label: 'Jan', partial: false },
  { key: '2026-02', label: 'Feb', partial: false },
  { key: '2026-03', label: 'Mar', partial: true },
];

const MATRIX = matrixOf({
  '2026-01': { Food: [1000, 4], Travel: [500, 1] },
  '2026-02': { Food: [300, 2] },
  '2026-03': { Travel: [200, 1] },
});

describe('foldCategoryReport', () => {
  it('unfiltered, sums every category in each period', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, null);
    expect(report.bars.map((b) => b.value)).toEqual([1500, 300, 200]);
    expect(report.total).toBe(2000);
  });

  it('unfiltered, ranks categories over the WHOLE window, biggest first', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, null);
    expect(report.categories).toEqual([
      { name: 'Food', value: 1300, count: 6 },
      { name: 'Travel', value: 700, count: 2 },
    ]);
    // The rows list is the filtered view's job — it must not also answer here.
    expect(report.rows).toEqual([]);
  });

  it('filtered, reads one column and the total sums that column', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, 'Food');
    expect(report.bars.map((b) => b.value)).toEqual([1000, 300, 0]);
    expect(report.total).toBe(1300);
    expect(report.categories).toEqual([]);
  });

  it('filtered, keeps periods with no spend so the list matches the chart', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, 'Food');
    expect(report.rows).toEqual([
      { key: '2026-01', label: 'Jan', value: 1000, count: 4 },
      { key: '2026-02', label: 'Feb', value: 300, count: 2 },
      { key: '2026-03', label: 'Mar', value: 0, count: 0 },
    ]);
  });

  it('carries each period’s partial flag onto its bar', () => {
    const report = foldCategoryReport(MATRIX, PERIODS, null);
    expect(report.bars.map((b) => b.partial)).toEqual([false, false, true]);
  });

  it('renders a period missing from the matrix as a real zero, not a gap', () => {
    const periods = [...PERIODS, { key: '2026-04', label: 'Apr', partial: false }];
    const report = foldCategoryReport(MATRIX, periods, null);
    expect(report.bars).toHaveLength(4);
    expect(report.bars[3]).toEqual({ key: '2026-04', label: 'Apr', value: 0, partial: false });
  });

  it('labels bars from the periods, so a yearly window reads as years', () => {
    const yearly: ReportPeriod[] = [
      { key: '2025', label: '2025', partial: false },
      { key: '2026', label: '2026', partial: true },
    ];
    const report = foldCategoryReport(matrixOf({ '2025': { Food: [900, 3] } }), yearly, 'Food');
    expect(report.bars.map((b) => b.label)).toEqual(['2025', '2026']);
    expect(report.bars.map((b) => b.value)).toEqual([900, 0]);
  });
});
