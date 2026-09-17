import { describe, it, expect } from 'vitest';
import { dayMarks, resolveSelectedDay } from './calendar-marks';
import type { EntryRow } from './schema';
import type { Cycle } from './cycle';

function entry(date: string, amount: number, over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 1,
    date,
    time: null,
    accountId: 1,
    categoryId: 1,
    amount,
    currency: 'THB',
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
    category: 'Food',
    account: 'Cash',
    ...over,
  };
}

const NO_SETS = [new Set<string>(), new Set<string>()] as const;

describe('dayMarks', () => {
  it('marks a posted recurring bill', () => {
    const marks = dayMarks([entry('2026-07-02', -1000, { source: 'recurring' })], [], ...NO_SETS);
    expect(marks.get('2026-07-02')).toEqual({ posted: true, upcoming: false, offBudget: false });
  });

  it('marks off-budget spend, from the entry flag or the category default', () => {
    const marks = dayMarks(
      [
        entry('2026-07-03', -500, { offBudget: 1 }),
        entry('2026-07-04', -80, { category: 'Gifts' }),
      ],
      [],
      new Set(['Gifts']),
      new Set<string>(),
    );
    expect(marks.get('2026-07-03')).toEqual({ posted: false, upcoming: false, offBudget: true });
    expect(marks.get('2026-07-04')).toEqual({ posted: false, upcoming: false, offBudget: true });
  });

  it('gives a recurring row in an off-budget category the off-budget mark only', () => {
    // Same precedence as splitBudgetSpend: off-budget is checked first.
    const marks = dayMarks(
      [entry('2026-07-05', -300, { source: 'recurring', offBudget: 1 })],
      [],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-05')).toEqual({ posted: false, upcoming: false, offBudget: true });
  });

  it('marks upcoming bill dates and merges kinds on the same day', () => {
    const marks = dayMarks(
      [entry('2026-07-10', -40, { offBudget: 1 })],
      ['2026-07-10', '2026-07-12'],
      ...NO_SETS,
    );
    expect(marks.get('2026-07-10')).toEqual({ posted: false, upcoming: true, offBudget: true });
    expect(marks.get('2026-07-12')).toEqual({ posted: false, upcoming: true, offBudget: false });
  });

  it('leaves an ordinary spending day unmarked', () => {
    expect(dayMarks([entry('2026-07-01', -100)], [], ...NO_SETS).has('2026-07-01')).toBe(false);
  });
});

// Cutoff 18: cycle '2026-06' runs 18 Jun – 17 Jul.
const cycle: Cycle = { key: '2026-06', start: '2026-06-18', end: '2026-07-17', label: 'Jun' };

describe('resolveSelectedDay', () => {
  it('keeps a ?day= inside the cycle', () => {
    expect(resolveSelectedDay('2026-06-20', cycle, '2026-07-05')).toBe('2026-06-20');
  });

  it('falls back to today when ?day= is missing, outside the cycle, or not a real day', () => {
    expect(resolveSelectedDay(undefined, cycle, '2026-07-05')).toBe('2026-07-05');
    expect(resolveSelectedDay('2026-07-18', cycle, '2026-07-05')).toBe('2026-07-05');
    expect(resolveSelectedDay('2026-06-31', cycle, '2026-07-05')).toBe('2026-07-05');
  });

  it("falls back to the cycle's last day when today is not in it (a past cycle)", () => {
    expect(resolveSelectedDay(undefined, cycle, '2026-08-01')).toBe('2026-07-17');
  });
});
