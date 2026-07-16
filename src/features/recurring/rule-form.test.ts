import { describe, it, expect } from 'vitest';
import { parseRuleForm } from './rule-form';

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

const valid = {
  name: 'Netflix',
  day: '5',
  intervalMonths: '1',
  account: 'visa',
  category: 'subscriptions',
  amount: '9.99',
  currency: 'USD',
  rate: '',
  totalCount: '',
  startSeq: '1',
};

describe('parseRuleForm', () => {
  it('parses a valid subscription and derives startDate from the day', () => {
    const got = parseRuleForm(fd(valid), '2026-07-01');
    expect(got).toEqual({
      ok: true,
      rule: {
        name: 'Netflix',
        day: 5,
        intervalMonths: 1,
        account: 'visa',
        category: 'subscriptions',
        amount: 9.99,
        currency: 'USD',
        rate: null,
        totalCount: null,
        startSeq: 1,
        startDate: '2026-07-05',
      },
    });
  });

  it("starts NEXT month when this month's day has already passed", () => {
    // Today is the 20th; a rule on the 5th should not immediately back-post this month's 5th.
    const got = parseRuleForm(fd(valid), '2026-07-20');
    expect(got).toMatchObject({ ok: true, rule: { startDate: '2026-08-05' } });
  });

  it('starts today when the day IS today', () => {
    expect(parseRuleForm(fd(valid), '2026-07-05')).toMatchObject({
      ok: true,
      rule: { startDate: '2026-07-05' },
    });
  });

  it('pre-clamps startDate for a 31st rule starting in a short month', () => {
    expect(parseRuleForm(fd({ ...valid, day: '31' }), '2026-02-01')).toMatchObject({
      ok: true,
      rule: { day: 31, startDate: '2026-02-28' },
    });
  });

  it('parses an installment with a pinned rate', () => {
    expect(
      parseRuleForm(fd({ ...valid, totalCount: '12', startSeq: '4', rate: '36.5' }), '2026-07-01'),
    ).toMatchObject({ ok: true, rule: { totalCount: 12, startSeq: 4, rate: 36.5 } });
  });

  it('rejects a blank name', () => {
    expect(parseRuleForm(fd({ ...valid, name: '  ' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Give the rule a name.',
    });
  });

  it('rejects a day outside 1..31', () => {
    expect(parseRuleForm(fd({ ...valid, day: '32' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Day must be between 1 and 31.',
    });
    expect(parseRuleForm(fd({ ...valid, day: '0' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Day must be between 1 and 31.',
    });
  });

  it('rejects a non-positive amount — a rule is an expense', () => {
    expect(parseRuleForm(fd({ ...valid, amount: '0' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Amount must be greater than zero.',
    });
    expect(parseRuleForm(fd({ ...valid, amount: '-5' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Amount must be greater than zero.',
    });
  });

  it('rejects an unknown currency', () => {
    expect(parseRuleForm(fd({ ...valid, currency: 'XYZ' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose a valid currency.',
    });
  });

  it('rejects an interval other than monthly or yearly', () => {
    expect(parseRuleForm(fd({ ...valid, intervalMonths: '3' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose monthly or yearly.',
    });
  });

  it('rejects a startSeq past totalCount — nothing would ever post', () => {
    expect(parseRuleForm(fd({ ...valid, totalCount: '12', startSeq: '13' }), '2026-07-01')).toEqual(
      { ok: false, error: 'The next payment number is past the total.' },
    );
  });

  it('rejects a blank account or category', () => {
    expect(parseRuleForm(fd({ ...valid, account: '' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose an account.',
    });
    expect(parseRuleForm(fd({ ...valid, category: '' }), '2026-07-01')).toEqual({
      ok: false,
      error: 'Choose a category.',
    });
  });
});
