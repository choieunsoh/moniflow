import { describe, it, expect } from 'vitest';
import {
  MIN_PROJECT_DAYS,
  safeToSpendPerDay,
  averagePerDay,
  projectCycleTotal,
  cycleDelta,
} from './dashboard';

describe('safeToSpendPerDay', () => {
  it('spreads the remaining budget over the days left', () => {
    // 3000 budget − 180 spent = 2820 remaining, over 29 days = ~97.24/day
    expect(safeToSpendPerDay(3000, 180, 29)).toBeCloseTo(2820 / 29);
  });

  it('returns null when no total budget is set (caller shows the average instead)', () => {
    expect(safeToSpendPerDay(null, 180, 29)).toBeNull();
  });

  it('floors at 0 when already over budget', () => {
    expect(safeToSpendPerDay(100, 250, 10)).toBe(0);
  });

  it('never divides by zero on the last day', () => {
    expect(safeToSpendPerDay(300, 100, 0)).toBe(200); // remaining spread over max(1,0)=1
  });
});

describe('averagePerDay', () => {
  it('is spent over elapsed days', () => {
    expect(averagePerDay(180, 3)).toBe(60);
  });

  it('guards day zero', () => {
    expect(averagePerDay(50, 0)).toBe(50);
  });
});

describe('projectCycleTotal', () => {
  it('extrapolates the current pace across the whole cycle', () => {
    // 180 over 3 days → 60/day × 31 = 1860
    expect(projectCycleTotal(180, 3, 31)).toBe(1860);
  });

  it('returns null before enough of the cycle has elapsed to project', () => {
    expect(projectCycleTotal(500, MIN_PROJECT_DAYS - 1, 31)).toBeNull();
  });
});

describe('cycleDelta', () => {
  it('reports the signed change vs last cycle with direction', () => {
    expect(cycleDelta(180, 200)).toEqual({ delta: -20, direction: 'down', prevTotal: 200 });
    expect(cycleDelta(250, 200)).toEqual({ delta: 50, direction: 'up', prevTotal: 200 });
    expect(cycleDelta(200, 200)).toEqual({ delta: 0, direction: 'same', prevTotal: 200 });
  });

  it('returns null when there is no comparable earlier cycle', () => {
    expect(cycleDelta(180, null)).toBeNull();
  });
});
