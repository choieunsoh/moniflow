import { describe, expect, it } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureTripTitlesTable } from './schema';
import { getTripTitles, setTripTitle } from './queries';
import { tripId } from './trips';

async function db() {
  const d = makeNodeProxyDb();
  await ensureTripTitlesTable(d);
  return d;
}

describe('trip titles', () => {
  it('sets and reads a trip name by its id', async () => {
    const d = await db();
    const id = tripId('JPY', '2024-02-08');
    await setTripTitle(d, id, 'Hokkaido 2024');
    expect((await getTripTitles(d)).get(id)).toBe('Hokkaido 2024');
  });

  it('upserts on the same id instead of duplicating', async () => {
    const d = await db();
    const id = tripId('JPY', '2024-02-08');
    await setTripTitle(d, id, 'Hokkaido 2024');
    await setTripTitle(d, id, 'Osaka 2024');
    expect(await getTripTitles(d)).toEqual(new Map([[id, 'Osaka 2024']]));
  });

  it('trims the name, and a blank name clears it', async () => {
    const d = await db();
    const id = tripId('JPY', '2024-02-08');
    await setTripTitle(d, id, '  Sapporo  ');
    expect((await getTripTitles(d)).get(id)).toBe('Sapporo');
    await setTripTitle(d, id, '   ');
    expect((await getTripTitles(d)).has(id)).toBe(false);
  });
});
