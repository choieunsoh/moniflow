import { describe, it, expect } from 'vitest';
import { committedThisCycle, type CommittedRule } from './upcoming';

const base: Omit<CommittedRule, 'amount' | 'rate' | 'currency'> = {
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
      { ...base, amount: 400, rate: null, currency: 'THB' }, // one occurrence 2026-08-15
      {
        ...base,
        day: 1,
        startDate: '2026-01-01',
        lastPosted: '2026-08-01',
        amount: 1200,
        rate: null,
        currency: 'THB',
      }, // next is 2026-09-01, outside window
    ];
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-24')).toEqual({
      total: 400,
      count: 1,
      byCurrency: [{ currency: 'THB', amount: 400 }],
    });
  });

  it('converts a pinned-rate FX rule at its rate, into the THB bucket', () => {
    const rules: CommittedRule[] = [{ ...base, amount: 10, rate: 36, currency: 'USD' }]; // 10 USD @ 36
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-24')).toEqual({
      total: 360,
      count: 1,
      byCurrency: [{ currency: 'THB', amount: 360 }],
    });
  });

  it('shows a blank-rate foreign bill in its own currency (not a faked ฿ figure)', () => {
    const rules: CommittedRule[] = [
      { ...base, amount: 107, rate: null, currency: 'USD' },
      { ...base, day: 20, amount: 400, rate: null, currency: 'THB' },
    ];
    // total still counts the $107 at face (documented safe-to-spend ceiling), but the display splits.
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-24')).toEqual({
      total: 507,
      count: 2,
      byCurrency: [
        { currency: 'USD', amount: 107 },
        { currency: 'THB', amount: 400 },
      ],
    });
  });

  it('is zero when no rule has an occurrence in the window', () => {
    const rules: CommittedRule[] = [{ ...base, amount: 400, rate: null, currency: 'THB' }];
    expect(committedThisCycle(rules, '2026-07-20', '2026-08-10')).toEqual({
      total: 0,
      count: 0,
      byCurrency: [],
    });
  });
});
