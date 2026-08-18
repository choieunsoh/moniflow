import { describe, it, expect } from 'vitest';
import {
  MIN_PROJECT_DAYS,
  safeToSpendPerDay,
  averagePerDay,
  projectCycleTotal,
  cycleDelta,
} from './dashboard';

describe('safeToSpendPerDay', () => {
  // `ceiling` arrives already net of the cycle's fixed cost — both the part that has posted and the
  // part still to come (use-home's fixedReserve). This fn no longer takes a `committed` argument of
  // its own: the same reservation reaching it by two routes is how you double-subtract it.
  it('spreads the ceiling minus spent over the days left', () => {
    // 2600 ceiling (3000 budget − 400 of fixed cost) − 180 spent = 2420, over 29 days
    expect(safeToSpendPerDay(2600, 180, 29)).toBeCloseTo(2420 / 29);
  });

  it('returns null when no total budget is set (caller shows the average instead)', () => {
    expect(safeToSpendPerDay(null, 180, 29)).toBeNull();
  });

  it('floors at 0 when spend has eaten the whole ceiling', () => {
    expect(safeToSpendPerDay(40, 60, 10)).toBe(0);
  });

  it('floors at 0 when fixed cost alone exceeds the budget', () => {
    // A ceiling can go NEGATIVE now — bills bigger than the budget — and must not hand back a
    // negative daily allowance.
    expect(safeToSpendPerDay(-500, 0, 10)).toBe(0);
  });

  it('never divides by zero on the last day', () => {
    expect(safeToSpendPerDay(300, 100, 0)).toBe(200);
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
