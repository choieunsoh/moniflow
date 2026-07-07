import { describe, it, expect } from 'vitest';
import { groupIntoTrips } from './trips';
import type { Entry } from './schema';

// Builds a full Entry row from the fields a test cares about; the shape is fixed but each test
// only varies date/currency/amount/originalAmount, so the rest gets sane JPY-trip defaults.
function entry(overrides: Partial<Entry>): Entry {
  return {
    id: 0,
    date: '2019-03-01',
    time: null,
    account: 'jpy',
    category: 'food',
    amount: -100,
    currency: 'JPY',
    originalAmount: -400,
    note: null,
    source: 'manual',
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
    ];
    const trips = groupIntoTrips(entries);
    expect(trips).toHaveLength(2);
    expect(trips[0]).toMatchObject({ start: '2019-03-01', end: '2019-03-02', count: 2 });
    expect(trips[1]).toMatchObject({ start: '2019-03-10', end: '2019-03-10', count: 1 });
  });

  it('does not split when the gap equals gapDays exactly (boundary is inclusive)', () => {
    const entries = [entry({ id: 1, date: '2019-03-01' }), entry({ id: 2, date: '2019-03-06' })];
    expect(groupIntoTrips(entries, 5)).toHaveLength(1);
  });

  it('starts a new trip on a currency change even with no date gap', () => {
    const entries = [
      entry({ id: 1, date: '2019-03-01', currency: 'JPY' }),
      entry({ id: 2, date: '2019-03-02', currency: 'HKD' }),
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
