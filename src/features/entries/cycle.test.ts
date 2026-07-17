import { describe, it, expect } from 'vitest';
import {
  cycleOf,
  cycleFromKey,
  currentCycleKey,
  stepKey,
  cycleProgress,
  lastCycles,
} from './cycle';

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

describe('cycleProgress', () => {
  it('reports the 1-based day within the cycle and its length', () => {
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-07-18')).toEqual({ day: 1, total: 31 });
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-07-20')).toEqual({ day: 3, total: 31 });
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-08-17')).toEqual({ day: 31, total: 31 });
  });

  it('clamps a date outside the cycle into range', () => {
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-09-01').day).toBe(31);
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-01-01').day).toBe(1);
  });
});

describe('lastCycles', () => {
  it('returns n cycles oldest first with the anchor last', () => {
    const got = lastCycles('2026-07', 6);
    expect(got.map((c) => c.key)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
  });

  it('rolls back across a year boundary', () => {
    expect(lastCycles('2026-01', 3).map((c) => c.key)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('returns just the anchor when n is 1', () => {
    expect(lastCycles('2026-07', 1).map((c) => c.key)).toEqual(['2026-07']);
  });

  it('returns an empty window when n is 0', () => {
    expect(lastCycles('2026-07', 0)).toEqual([]);
  });

  it('builds full cycles honouring the cutoff', () => {
    const [first] = lastCycles('2026-07', 2, 18);
    expect(first).toMatchObject({ key: '2026-06', start: '2026-06-18', end: '2026-07-17' });
  });

  it('honours a non-default cutoff', () => {
    const [first] = lastCycles('2026-07', 2, 1);
    expect(first).toMatchObject({ key: '2026-06', start: '2026-06-01', end: '2026-06-30' });
  });
});
