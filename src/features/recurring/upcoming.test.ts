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

// A live-FX rule (foreign currency, no pinned rate) used to be counted at its FACE amount: a $107
// bill reserved ฿107 instead of ~฿3,700. Harmless-ish while this figure only nudged safe-to-spend;
// once it started setting the budget CEILING it became a 30x lie in the headline figure.
describe('committedThisCycle — live-FX rules', () => {
  const usd = (amount: number): CommittedRule => ({
    ...base,
    amount,
    rate: null,
    currency: 'USD',
  });

  it('converts a live-FX rule at the supplied effective rate', () => {
    const rates = new Map([['USD', 34.5]]);
    const got = committedThisCycle([usd(107)], '2026-08-01', '2026-08-31', rates);
    expect(got.total).toBeCloseTo(107 * 34.5);
    // Display still names the money in the currency it is actually charged in.
    expect(got.byCurrency).toEqual([{ currency: 'USD', amount: 107 }]);
  });

  it('leaves a pinned-rate rule alone — the pin is what the statement charged', () => {
    const pinned: CommittedRule = { ...base, amount: 107, rate: 36, currency: 'USD' };
    const got = committedThisCycle([pinned], '2026-08-01', '2026-08-31', new Map([['USD', 34.5]]));
    expect(got.total).toBeCloseTo(107 * 36); // the pin wins, not the cached rate
  });

  it('falls back to face value when no rate is known for the currency', () => {
    // Nothing cached for this code yet (rates never refreshed). Face value under-reserves, but the
    // alternative is inventing a rate; byCurrency keeps it visibly foreign so the card does not lie.
    const got = committedThisCycle([usd(107)], '2026-08-01', '2026-08-31', new Map());
    expect(got.total).toBe(107);
    expect(got.byCurrency).toEqual([{ currency: 'USD', amount: 107 }]);
  });
});
