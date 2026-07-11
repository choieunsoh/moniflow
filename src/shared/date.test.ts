import { describe, it, expect } from 'vitest';
import { formatDayHeading, formatDayHeadingWithYear, shiftIso } from './date';

// DB keys are UTC 'YYYY-MM-DD' rendered in Asia/Bangkok. Bangkok is UTC+7 with no DST, so parsing at
// UTC midnight keeps the displayed day equal to the key — these guard that the year variant carries
// the year and that neither formatter drifts a day across the zone offset.
describe('day headings', () => {
  it('formats a heading without the year', () => {
    expect(formatDayHeading('2026-07-09')).toBe('Thu 9 Jul');
  });

  it('formats a heading with the year for cross-cycle search results', () => {
    expect(formatDayHeadingWithYear('2026-07-09')).toBe('Thu 9 Jul 2026');
    expect(formatDayHeadingWithYear('2019-03-01')).toBe('Fri 1 Mar 2019');
  });
});

// The keypad's Today/Yesterday chips shift the anchor date; guard the boundary cases where naive
// date math would drift (month/year rollover, leap day).
describe('shiftIso', () => {
  it('subtracts a day', () => {
    expect(shiftIso('2026-07-11', -1)).toBe('2026-07-10');
  });

  it('crosses a month boundary going back', () => {
    expect(shiftIso('2026-07-01', -1)).toBe('2026-06-30');
  });

  it('lands on a leap day', () => {
    expect(shiftIso('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('adds whole days forward across a year boundary', () => {
    expect(shiftIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});
