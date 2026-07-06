import { describe, it, expect } from 'vitest';
import { cycleOf, cycleFromKey, currentCycleKey, stepKey } from './cycle';

describe('cycleOf (cutoff 18)', () => {
  it('a date on/after the 18th belongs to that month cycle', () => {
    expect(cycleOf('2026-07-18')).toEqual({
      key: '2026-07',
      start: '2026-07-18',
      end: '2026-08-17',
      label: '18 Jul – 17 Aug 2026',
    });
  });

  it('a date before the 18th belongs to the previous month cycle', () => {
    expect(cycleOf('2026-08-17').key).toBe('2026-07');
    expect(cycleOf('2026-08-17').end).toBe('2026-08-17');
  });

  it('rolls the year over at December', () => {
    expect(cycleOf('2027-01-05')).toEqual({
      key: '2026-12',
      start: '2026-12-18',
      end: '2027-01-17',
      label: '18 Dec 2026 – 17 Jan 2027',
    });
  });
});

describe('cycleFromKey / stepKey / currentCycleKey', () => {
  it('builds a cycle from its key', () => {
    expect(cycleFromKey('2026-07').start).toBe('2026-07-18');
  });

  it('steps month keys forward and back, across year boundaries', () => {
    expect(stepKey('2026-07', 1)).toBe('2026-08');
    expect(stepKey('2026-01', -1)).toBe('2025-12');
    expect(stepKey('2026-12', 1)).toBe('2027-01');
  });

  it('derives the current cycle key from today', () => {
    expect(currentCycleKey('2026-07-06')).toBe('2026-06');
    expect(currentCycleKey('2026-07-18')).toBe('2026-07');
  });
});
