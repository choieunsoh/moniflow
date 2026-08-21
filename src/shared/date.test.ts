import { describe, it, expect } from 'vitest';
import { formatDayHeading, formatDayHeadingWithYear } from './date';

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

describe('September abbreviation', () => {
  // CLDR 42 made en-GB's abbreviated September four letters ("Sept"). Every month label in the app
  // is three letters, so September must be too.
  it('renders September as a three-letter Sep', () => {
    expect(formatDayHeading('2025-09-04')).toBe('Thu 4 Sep');
    expect(formatDayHeadingWithYear('2025-09-04')).toBe('Thu 4 Sep 2025');
  });
});
