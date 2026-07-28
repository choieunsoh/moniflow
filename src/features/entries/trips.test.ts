import { describe, it, expect } from 'vitest';
import {
  groupIntoTrips,
  formatForeign,
  formatTripRange,
  formatMonthYear,
  tripDays,
  sumByCurrency,
} from './trips';
import type { Entry } from './schema';

// Builds a full Entry row from the fields a test cares about; the shape is fixed but each test
// only varies date/currency/amount/originalAmount, so the rest gets sane JPY-trip defaults.
function entry(overrides: Partial<Entry>): Entry {
  return {
    id: 0,
    date: '2019-03-01',
    time: null,
    accountId: 1,
    categoryId: 1,
    amount: -100,
    currency: 'JPY',
    originalAmount: -400,
    note: null,
    source: 'manual',
    offBudget: null,
    ...overrides,
  };
}

describe('groupIntoTrips', () => {
  it('groups a contiguous run of same-currency entries into one trip', () => {
    const entries = [
      entry({ id: 1, date: '2019-03-01', amount: -100, originalAmount: -400 }),
      entry({ id: 2, date: '2019-03-03', amount: -150, originalAmount: -600 }),
      entry({ id: 3, date: '2019-03-05', amount: -250, originalAmount: -1000 }),
    ];
    expect(groupIntoTrips(entries)).toEqual([
      {
        currency: 'JPY',
        start: '2019-03-01',
        end: '2019-03-05',
        count: 3,
        originalTotal: 2000,
        thbTotal: 500,
      },
    ]);
  });

  it('starts a new trip when the gap since the previous entry exceeds gapDays', () => {
    const entries = [
      entry({ id: 1, date: '2019-03-01' }),
      entry({ id: 2, date: '2019-03-02' }),
      entry({ id: 3, date: '2019-03-10' }), // 8 days after 03-02
      entry({ id: 4, date: '2019-03-11' }),
    ];
    const trips = groupIntoTrips(entries);
    expect(trips).toHaveLength(2);
    expect(trips[0]).toMatchObject({ start: '2019-03-01', end: '2019-03-02', count: 2 });
    expect(trips[1]).toMatchObject({ start: '2019-03-10', end: '2019-03-11', count: 2 });
  });

  it('drops single-day runs — foreign spending on one day is online shopping, not a trip', () => {
    const entries = [
      entry({ id: 1, date: '2019-03-01' }),
      entry({ id: 2, date: '2019-03-02' }), // a real 2-day trip
      entry({ id: 3, date: '2019-03-20' }), // a lone foreign purchase 18 days later
    ];
    const trips = groupIntoTrips(entries);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ start: '2019-03-01', end: '2019-03-02' });
  });

  it('does not split when the gap equals gapDays exactly (boundary is inclusive)', () => {
    const entries = [entry({ id: 1, date: '2019-03-01' }), entry({ id: 2, date: '2019-03-06' })];
    expect(groupIntoTrips(entries, 5)).toHaveLength(1);
  });

  it('starts a new trip on a currency change even with no date gap', () => {
    const entries = [
      entry({ id: 1, date: '2019-03-01', currency: 'JPY' }),
      entry({ id: 2, date: '2019-03-02', currency: 'JPY' }),
      entry({ id: 3, date: '2019-03-03', currency: 'HKD' }),
      entry({ id: 4, date: '2019-03-04', currency: 'HKD' }),
    ];
    expect(groupIntoTrips(entries).map((t) => t.currency)).toEqual(['JPY', 'HKD']);
  });

  it('sums magnitudes, so a positive (refund) row still adds to the totals', () => {
    const entries = [
      entry({ id: 1, date: '2019-03-01', amount: -100, originalAmount: -400 }),
      entry({ id: 2, date: '2019-03-02', amount: 20, originalAmount: 80 }), // refund
    ];
    const [trip] = groupIntoTrips(entries);
    expect(trip.originalTotal).toBe(480);
    expect(trip.thbTotal).toBe(120);
  });

  it('returns an empty array for no entries', () => {
    expect(groupIntoTrips([])).toEqual([]);
  });
});

describe('tripDays', () => {
  it('counts the span inclusively (11 Feb – 17 Feb is 7 days)', () => {
    const trip = groupIntoTrips([
      entry({ id: 1, date: '2020-02-11' }),
      entry({ id: 2, date: '2020-02-16' }), // within gapDays so it stays one trip
      entry({ id: 3, date: '2020-02-17' }),
    ])[0];
    expect(tripDays(trip)).toBe(7);
  });

  it('counts a two-day trip as 2', () => {
    const trip = groupIntoTrips([
      entry({ id: 1, date: '2020-02-11' }),
      entry({ id: 2, date: '2020-02-12' }),
    ])[0];
    expect(tripDays(trip)).toBe(2);
  });
});

describe('sumByCurrency', () => {
  it('sums each currency’s original magnitudes and skips THB / unpriced rows', () => {
    const entries = [
      entry({ id: 1, currency: 'JPY', originalAmount: -400 }),
      entry({ id: 2, currency: 'JPY', originalAmount: 100 }), // refund still adds
      entry({ id: 3, currency: 'HKD', originalAmount: -50 }),
      entry({ id: 4, currency: 'THB', originalAmount: -999 }),
      entry({ id: 5, currency: 'JPY', originalAmount: null }),
    ];
    expect(sumByCurrency(entries)).toEqual([
      { currency: 'JPY', total: 500 },
      { currency: 'HKD', total: 50 },
    ]);
  });

  it('returns an empty array when nothing is foreign', () => {
    expect(sumByCurrency([entry({ id: 1, currency: 'THB', originalAmount: -100 })])).toEqual([]);
  });
});

describe('formatMonthYear', () => {
  it('formats the month and year of a date (UTC, no day)', () => {
    expect(formatMonthYear('2024-02-08')).toBe('Feb 2024');
  });
});

describe('formatForeign', () => {
  it('formats an amount with the currency’s own symbol and no fraction digits', () => {
    expect(formatForeign(12345, 'JPY')).toBe('¥12,345');
  });

  it('works for a different currency (HKD)', () => {
    expect(formatForeign(500, 'HKD')).toBe('HK$500');
  });

  it('keeps the yen and won glyphs', () => {
    expect(formatForeign(1234, 'JPY')).toContain('¥');
    expect(formatForeign(1234, 'KRW')).toContain('₩');
  });

  it('distinguishes Hong Kong dollars from US dollars', () => {
    expect(formatForeign(108, 'HKD')).not.toEqual(formatForeign(108, 'USD'));
    expect(formatForeign(108, 'HKD')).toContain('HK$');
  });

  it('falls back to the code for a currency with no symbol', () => {
    expect(formatForeign(108, 'MOP')).toContain('MOP');
  });
});

describe('formatTripRange', () => {
  it('omits the year at the start when the trip stays within one year', () => {
    const trip = {
      currency: 'JPY',
      start: '2019-03-01',
      end: '2019-03-05',
      count: 1,
      originalTotal: 0,
      thbTotal: 0,
    };
    expect(formatTripRange(trip)).toBe('01 Mar – 05 Mar 2019');
  });

  it('shows both years when the trip crosses a year boundary', () => {
    const trip = {
      currency: 'JPY',
      start: '2019-12-28',
      end: '2020-01-03',
      count: 1,
      originalTotal: 0,
      thbTotal: 0,
    };
    expect(formatTripRange(trip)).toBe('28 Dec 2019 – 03 Jan 2020');
  });
});
