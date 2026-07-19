'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getForeignEntries, getTripTitles } from './queries';
import { groupIntoTrips, type Trip } from './trips';
import { useDataVersion } from '@shared/data-version';

export type TripsData = { trips: Trip[]; titles: Map<string, string> };

// Trips page's data, read once via the browser OPFS db after mount — mirrors the server computation
// the page used to run in a Server Component, just moved client-side + async. Re-runs whenever the
// data-version counter bumps (e.g. after TripRename saves a name).
export function useTrips(): { ready: boolean; data: TripsData | null } {
  const [data, setData] = useState<TripsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      setReady(false);
      const [foreignEntries, titles] = await Promise.all([
        getForeignEntries(db),
        getTripTitles(db),
      ]);
      const trips = groupIntoTrips(foreignEntries);
      setData({ trips, titles });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
