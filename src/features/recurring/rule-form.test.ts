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

  describe('yearly rules carry a renewal month', () => {
    const yearly = { ...valid, intervalMonths: '12' };

    it('requires a month when the cadence is yearly', () => {
      expect(parseRuleForm(fd(yearly), '2026-07-01')).toEqual({
        ok: false,
        error: 'Choose which month a yearly rule renews in.',
      });
    });

    it('rejects a month outside 1..12', () => {
      expect(parseRuleForm(fd({ ...yearly, month: '13' }), '2026-07-01')).toEqual({
        ok: false,
        error: 'Choose which month a yearly rule renews in.',
      });
    });

    it('builds startDate from the chosen month + day, this year if it has not passed', () => {
      // Renews every March 5th; today is Jan → this year's March is still ahead.
      expect(parseRuleForm(fd({ ...yearly, month: '3', day: '5' }), '2026-01-10')).toMatchObject({
        ok: true,
        rule: { intervalMonths: 12, startDate: '2026-03-05' },
      });
    });

    it('rolls to next year when the chosen month + day has already passed', () => {
      // Renews every March 5th; today is July → this year's March is behind us.
      expect(parseRuleForm(fd({ ...yearly, month: '3', day: '5' }), '2026-07-10')).toMatchObject({
        ok: true,
        rule: { startDate: '2027-03-05' },
      });
    });

    it('ignores an accidental month on a monthly rule', () => {
      // month is only read when yearly, so a stray value can't corrupt a monthly schedule.
      expect(parseRuleForm(fd({ ...valid, month: '9' }), '2026-07-01')).toMatchObject({
        ok: true,
        rule: { intervalMonths: 1, startDate: '2026-07-05' },
      });
    });
  });

  describe('editing preserves the schedule anchor', () => {
    // The bug this guards: startDate is the sequence anchor paidCount measures against. Recomputing
    // it on every edit silently rewinds progress and makes the sweep repost already-paid installments.
    const current = { startDate: '2026-07-01', intervalMonths: 1 };

    it('keeps the existing startDate when only the amount changed', () => {
      const got = parseRuleForm(
        fd({ ...valid, day: '1', amount: '250', currency: 'THB' }),
        '2026-09-20',
        current,
      );
      expect(got).toMatchObject({ ok: true, rule: { startDate: '2026-07-01' } });
    });

    it('keeps the anchor even when the day changes — schedule.ts reads the day from `day`', () => {
      const got = parseRuleForm(
        fd({ ...valid, day: '15', amount: '250', currency: 'THB' }),
        '2026-09-20',
        current,
      );
      expect(got).toMatchObject({ ok: true, rule: { day: 15, startDate: '2026-07-01' } });
    });

    it('MOVES the anchor when the cadence changed — a new cadence is a new schedule', () => {
      const got = parseRuleForm(
        fd({ ...valid, intervalMonths: '12', month: '7', day: '1', currency: 'THB' }),
        '2026-09-20',
        current,
      );
      // Monthly → yearly: the old monthly anchor no longer describes the schedule, so it re-anchors.
      expect(got).toMatchObject({ ok: true, rule: { startDate: '2027-07-01' } });
    });

    it('MOVES the anchor when a yearly rule points at a different month', () => {
      const yearlyCurrent = { startDate: '2026-03-05', intervalMonths: 12 };
      const got = parseRuleForm(
        fd({ ...valid, intervalMonths: '12', month: '9', day: '5', currency: 'THB' }),
        '2026-07-20',
        yearlyCurrent,
      );
      expect(got).toMatchObject({ ok: true, rule: { startDate: '2026-09-05' } });
    });

    it('keeps the anchor when a yearly rule keeps its month', () => {
      const yearlyCurrent = { startDate: '2026-03-05', intervalMonths: 12 };
      const got = parseRuleForm(
        fd({ ...valid, intervalMonths: '12', month: '3', day: '5', amount: '99', currency: 'THB' }),
        '2026-07-20',
        yearlyCurrent,
      );
      expect(got).toMatchObject({ ok: true, rule: { startDate: '2026-03-05' } });
    });
  });
});
