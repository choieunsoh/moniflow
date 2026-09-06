import { describe, it, expect } from 'vitest';
import { dayPace } from './day-pace';
import { cycleFromKey } from './cycle';

// An 18th-of-the-month cutoff, matching the app's default: 2026-07 runs 18 Jul → 17 Aug (31 days).
const cycle = cycleFromKey('2026-07', 18);

describe('dayPace', () => {
  it('splits completed days into no-spend / under / over against the rolling target', () => {
    // ฿3,100 over a 31-day cycle → day 1's target is ฿100. Day 1 spends 300 (over), which drops the
    // remaining to 2,800 over 30 days → ฿93.33 for day 2, which spends 50 (under). Day 3 spends
    // nothing. Today is the 21st, so days 1–3 (18th–20th) are the completed ones.
    const spend = new Map([
      ['2026-07-18', 300],
      ['2026-07-19', 50],
    ]);
    expect(dayPace(spend, cycle, '2026-07-21', 3100)).toEqual({
      noSpend: 1,
      under: 1,
      over: 1,
      days: 3,
    });
  });

  it('excludes today — a day still in progress is not a no-spend day', () => {
    // Nothing spent at all. On the 20th only the 18th and 19th are finished.
    expect(dayPace(new Map(), cycle, '2026-07-20', 3100)).toEqual({
      noSpend: 2,
      under: 0,
      over: 0,
      days: 2,
    });
  });

  it('grades every day of a past cycle, including its last', () => {
    const pace = dayPace(new Map([['2026-08-17', 10]]), cycle, '2026-09-02', 3100);
    expect(pace).toEqual({ noSpend: 30, under: 1, over: 0, days: 31 });
  });

  it('a day spending exactly its allowance is under, not over', () => {
    expect(dayPace(new Map([['2026-07-18', 100]]), cycle, '2026-07-20', 3100)).toEqual({
      noSpend: 1,
      under: 1,
      over: 0,
      days: 2,
    });
  });

  it('once the ceiling is gone every spending day is over (target floors at 0)', () => {
    // Day 1 blows the whole ฿100 ceiling; day 2 spends ฿1 against a ฿0 allowance.
    expect(
      dayPace(
        new Map([
          ['2026-07-18', 500],
          ['2026-07-19', 1],
        ]),
        cycle,
        '2026-07-21',
        100,
      ),
    ).toEqual({ noSpend: 1, under: 0, over: 2, days: 3 });
  });

  it('a refund-only day counts as no-spend, and its credit funds later days', () => {
    const spend = new Map([
      ['2026-07-18', -200],
      ['2026-07-19', 150],
    ]);
    // The refund lifts the remaining ceiling to 3,300 over 30 days → ฿110 for day 2, so ฿150 is over.
    expect(dayPace(spend, cycle, '2026-07-20', 3100)).toEqual({
      noSpend: 1,
      under: 0,
      over: 1,
      days: 2,
    });
  });

  it('is null with no ceiling to measure against, and on the cycle first day', () => {
    expect(dayPace(new Map(), cycle, '2026-07-21', null)).toBeNull();
    expect(dayPace(new Map(), cycle, '2026-07-18', 3100)).toBeNull();
  });
});
