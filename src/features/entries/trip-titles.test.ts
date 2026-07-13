import { describe, expect, it } from 'vitest';
import { initDb } from '@db/client';
import { ensureTripTitlesTable } from './schema';
import { getTripTitles, setTripTitle } from './queries';
import { tripId } from './trips';

function db() {
  const d = initDb(':memory:');
  ensureTripTitlesTable(d);
  return d;
}

describe('trip titles', () => {
  it('sets and reads a trip name by its id', () => {
    const d = db();
    const id = tripId('JPY', '2024-02-08');
    setTripTitle(d, id, 'Hokkaido 2024');
    expect(getTripTitles(d).get(id)).toBe('Hokkaido 2024');
  });

  it('upserts on the same id instead of duplicating', () => {
    const d = db();
    const id = tripId('JPY', '2024-02-08');
    setTripTitle(d, id, 'Hokkaido 2024');
    setTripTitle(d, id, 'Osaka 2024');
    expect(getTripTitles(d)).toEqual(new Map([[id, 'Osaka 2024']]));
  });

  it('trims the name, and a blank name clears it', () => {
    const d = db();
    const id = tripId('JPY', '2024-02-08');
    setTripTitle(d, id, '  Sapporo  ');
    expect(getTripTitles(d).get(id)).toBe('Sapporo');
    setTripTitle(d, id, '   ');
    expect(getTripTitles(d).has(id)).toBe(false);
  });
});
