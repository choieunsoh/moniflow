import { describe, it, expect } from 'vitest';
import { committedThisCycle, type CommittedRule } from './upcoming';

const base: Omit<CommittedRule, 'amount' | 'rate'> = {
  day: 15,
  intervalMonths: 1,
  startDate: '2026-01-15',
  startSeq: 1,
  totalCount: null,
  lastPosted: '2026-07-15',
};

describe('committedThisCycle', () => {
  it("sums amounts over each rule's occurrences in (today, cycleEnd]", () => {
    const rules: CommittedRule[] = [
      { ...base, amount: 400, rate: null }, // one occurrence 2026-08-15
      {
        ...base,
        day: 1,
        startDate: '2026-01-01',
        lastPosted: '2026-08-01',
        amount: 1200,
        rate: null,
      }, // next is 2026-09-01, outside window
    ];
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-24')).toEqual({ total: 400, count: 1 });
  });

  it('converts a pinned-rate FX rule at its rate', () => {
    const rules: CommittedRule[] = [{ ...base, amount: 10, rate: 36 }]; // 10 USD @ 36 = 360 THB
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-24')).toEqual({ total: 360, count: 1 });
  });

  it('is zero when no rule has an occurrence in the window', () => {
    const rules: CommittedRule[] = [{ ...base, amount: 400, rate: null }];
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-10')).toEqual({ total: 0, count: 0 });
  });
});
