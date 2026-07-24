import { describe, it, expect } from 'vitest';
import {
  clampDay,
  dueDateAt,
  paidCount,
  maxPosts,
  duePosts,
  postsBetween,
  progressOf,
  noteFor,
  nextOccurrence,
  type Rule,
} from './schedule';

// A monthly subscription on the 5th, never posted.
const netflix: Rule = {
  day: 5,
  intervalMonths: 1,
  startDate: '2026-07-05',
  startSeq: 1,
  totalCount: null,
  lastPosted: null,
};

// A 12-month installment where 3 were already paid elsewhere, so the next is #4.
const fridge: Rule = {
  day: 1,
  intervalMonths: 1,
  startDate: '2026-07-01',
  startSeq: 4,
  totalCount: 12,
  lastPosted: null,
};

describe('clampDay', () => {
  it('clamps a 31st rule to the last day of a short month', () => {
    expect(clampDay(2026, 2, 31)).toBe('2026-02-28');
    expect(clampDay(2026, 4, 31)).toBe('2026-04-30');
    expect(clampDay(2026, 1, 31)).toBe('2026-01-31');
  });

  it('clamps to Feb 29 in a leap year', () => {
    expect(clampDay(2028, 2, 31)).toBe('2028-02-29');
    expect(clampDay(2028, 2, 30)).toBe('2028-02-29');
  });

  it('pads single digits', () => {
    expect(clampDay(2026, 3, 5)).toBe('2026-03-05');
  });
});

describe('dueDateAt', () => {
  it('steps monthly from the start month, re-clamping each month', () => {
    const eom: Rule = { ...netflix, day: 31, startDate: '2026-01-31' };
    expect(dueDateAt(eom, 0)).toBe('2026-01-31');
    expect(dueDateAt(eom, 1)).toBe('2026-02-28'); // clamped
    expect(dueDateAt(eom, 2)).toBe('2026-03-31'); // and back to 31 — day is the anchor
  });

  it('steps a year for intervalMonths 12', () => {
    const icloud: Rule = { ...netflix, intervalMonths: 12 };
    expect(dueDateAt(icloud, 0)).toBe('2026-07-05');
    expect(dueDateAt(icloud, 1)).toBe('2027-07-05');
  });

  it('rolls the year on a monthly step', () => {
    const dec: Rule = { ...netflix, startDate: '2026-12-05' };
    expect(dueDateAt(dec, 1)).toBe('2027-01-05');
  });
});

describe('paidCount', () => {
  it('is 0 when never posted', () => {
    expect(paidCount(netflix)).toBe(0);
  });

  it('counts due dates at or before lastPosted', () => {
    expect(paidCount({ ...netflix, lastPosted: '2026-07-05' })).toBe(1);
    expect(paidCount({ ...netflix, lastPosted: '2026-09-05' })).toBe(3);
  });

  it('does not count a due date later in lastPosted month', () => {
    expect(paidCount({ ...netflix, lastPosted: '2026-09-03' })).toBe(2);
  });

  it('counts a yearly rule once per year', () => {
    const icloud: Rule = { ...netflix, intervalMonths: 12, lastPosted: '2027-07-05' };
    expect(paidCount(icloud)).toBe(2);
  });
});

describe('maxPosts', () => {
  it('is null for an open-ended subscription', () => {
    expect(maxPosts(netflix)).toBeNull();
  });

  it('accounts for payments made before the rule existed', () => {
    expect(maxPosts(fridge)).toBe(9); // #4..#12
    expect(maxPosts({ ...fridge, startSeq: 1 })).toBe(12);
  });

  it('is 0, not negative, for an already-finished installment', () => {
    expect(maxPosts({ ...fridge, startSeq: 13 })).toBe(0);
  });
});

describe('duePosts', () => {
  it('is empty before the start date', () => {
    expect(duePosts(netflix, '2026-07-04')).toEqual([]);
  });

  it('posts on the due date itself', () => {
    expect(duePosts(netflix, '2026-07-05')).toEqual([{ date: '2026-07-05', seq: 1 }]);
  });

  it('catches up every missed month, in order', () => {
    expect(duePosts(netflix, '2026-09-20')).toEqual([
      { date: '2026-07-05', seq: 1 },
      { date: '2026-08-05', seq: 2 },
      { date: '2026-09-05', seq: 3 },
    ]);
  });

  it('is empty when already posted through today — idempotence', () => {
    expect(duePosts({ ...netflix, lastPosted: '2026-09-05' }, '2026-09-20')).toEqual([]);
  });

  it('resumes from lastPosted, not from the start', () => {
    expect(duePosts({ ...netflix, lastPosted: '2026-07-05' }, '2026-09-20')).toEqual([
      { date: '2026-08-05', seq: 2 },
      { date: '2026-09-05', seq: 3 },
    ]);
  });

  it('numbers an installment from startSeq and stops at totalCount', () => {
    const due = duePosts(fridge, '2030-01-01');
    expect(due).toHaveLength(9);
    expect(due[0]).toEqual({ date: '2026-07-01', seq: 4 });
    expect(due[8]).toEqual({ date: '2027-03-01', seq: 12 });
  });

  it('posts nothing for a finished installment', () => {
    expect(duePosts({ ...fridge, lastPosted: '2027-03-01' }, '2030-01-01')).toEqual([]);
  });

  it('steps a yearly rule once per year, not once per month', () => {
    const icloud: Rule = { ...netflix, intervalMonths: 12 };
    expect(duePosts(icloud, '2028-09-01')).toEqual([
      { date: '2026-07-05', seq: 1 },
      { date: '2027-07-05', seq: 2 },
      { date: '2028-07-05', seq: 3 },
    ]);
  });
});

describe('progressOf', () => {
  it('reports payments made before the rule existed as already paid', () => {
    expect(progressOf(fridge)).toEqual({ paid: 3, total: 12, remaining: 9 });
  });

  it('advances as posts happen', () => {
    expect(progressOf({ ...fridge, lastPosted: '2026-07-01' })).toEqual({
      paid: 4,
      total: 12,
      remaining: 8,
    });
  });

  it('has no total or remaining for a subscription', () => {
    expect(progressOf({ ...netflix, lastPosted: '2026-08-05' })).toEqual({
      paid: 2,
      total: null,
      remaining: null,
    });
  });
});

describe('noteFor', () => {
  it('appends the counter for an installment', () => {
    expect(noteFor({ name: 'Fridge', totalCount: 12 }, 4)).toBe('Fridge (4/12)');
  });

  it('leaves a subscription note bare', () => {
    expect(noteFor({ name: 'Netflix', totalCount: null }, 3)).toBe('Netflix');
  });
});

describe('nextOccurrence', () => {
  it('returns this month when the day has not passed', () => {
    expect(nextOccurrence(20, null, '2026-07-10', 1)).toBe('2026-07-20');
  });
  it('rolls to next month when the day has passed', () => {
    expect(nextOccurrence(5, null, '2026-07-10', 1)).toBe('2026-08-05');
  });
  it('returns today when the day IS today', () => {
    expect(nextOccurrence(10, null, '2026-07-10', 1)).toBe('2026-07-10');
  });
  it('clamps a 31st monthly rule to a short month', () => {
    expect(nextOccurrence(31, null, '2026-02-01', 1)).toBe('2026-02-28');
  });
  it('rolls a monthly December day into next January', () => {
    expect(nextOccurrence(5, null, '2026-12-10', 1)).toBe('2027-01-05');
  });
  it('returns this year for a yearly rule whose month is ahead', () => {
    expect(nextOccurrence(5, 3, '2026-01-10', 12)).toBe('2026-03-05');
  });
  it('rolls a yearly rule to next year when its month has passed', () => {
    expect(nextOccurrence(5, 3, '2026-07-10', 12)).toBe('2027-03-05');
  });
});

describe('postsBetween', () => {
  const monthly: Rule = {
    day: 15,
    intervalMonths: 1,
    startDate: '2026-01-15',
    startSeq: 1,
    totalCount: null,
    lastPosted: '2026-07-15',
  };

  it('returns occurrences strictly after `after`, through `through` inclusive', () => {
    // window is the rest of a cycle: after today (2026-07-20), through cycle end (2026-08-24)
    expect(postsBetween(monthly, '2026-07-20', '2026-08-24')).toEqual([
      { date: '2026-08-15', seq: 8 },
    ]);
  });

  it('excludes an occurrence falling on `after` itself', () => {
    expect(postsBetween(monthly, '2026-08-15', '2026-09-30')).toEqual([
      { date: '2026-09-15', seq: 9 },
    ]);
  });

  it('includes an occurrence landing exactly on `through`', () => {
    expect(postsBetween(monthly, '2026-07-20', '2026-08-15')).toEqual([
      { date: '2026-08-15', seq: 8 },
    ]);
  });

  it('is empty when nothing is due before `through`', () => {
    expect(postsBetween(monthly, '2026-07-20', '2026-08-10')).toEqual([]);
  });

  it('respects an installment cap — no posts past the final one', () => {
    const installment: Rule = {
      day: 1,
      intervalMonths: 1,
      startDate: '2026-06-01',
      startSeq: 1,
      totalCount: 3, // final due date 2026-08-01
      lastPosted: '2026-07-01',
    };
    expect(postsBetween(installment, '2026-07-20', '2026-12-31')).toEqual([
      { date: '2026-08-01', seq: 3 },
    ]);
  });
});
