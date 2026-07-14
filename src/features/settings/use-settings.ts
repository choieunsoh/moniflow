'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import {
  getCutoff,
  getIconSet,
  getCardFeePct,
  getFontScale,
  type IconSet,
  type FontScale,
} from './queries';
import { useDataVersion } from '@shared/data-version';

export type SettingsData = {
  cutoff: number;
  iconSet: IconSet;
  cardFeePct: number;
  fontScale: FontScale;
};

// Settings page's values, read once via the browser OPFS db after mount — mirrors the server
// computation the page used to run in a Server Component, just moved client-side + async. Re-runs
// whenever the data-version bumps, so a save from this same page (cutoff/icon-set/card-fee actions
// already bump it) repaints the other fields' defaultValue too.
export function useSettings(): { ready: boolean; data: SettingsData | null } {
  const [data, setData] = useState<SettingsData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const [cutoff, iconSet, cardFeePct, fontScale] = await Promise.all([
        getCutoff(db),
        getIconSet(db),
        getCardFeePct(db),
        getFontScale(db),
      ]);
      setData({ cutoff, iconSet, cardFeePct, fontScale });
      setReady(true);
    })();
  }, [version]);

  return { ready, data };
}
