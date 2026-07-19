'use client';

import { useEffect } from 'react';
import { withDb } from '@shared/db-effect';
import { getFontScale, FONT_SCALE_PCT, FONT_SCALE_STORAGE_KEY } from './queries';
import { useDataVersion } from '@shared/data-version';

// Single writer of the app-wide font size. Reads the source-of-truth scale from OPFS, applies its
// percent to the root <html> (scaling the whole rem-based UI), and refreshes the localStorage cache
// the pre-paint inline script (layout.tsx) reads on the next load. Re-runs on every data-version
// bump, so saving a new scale in Settings resizes the app live — and reconciles the cache if it ever
// drifts from OPFS (e.g. localStorage cleared but OPFS kept). Called once, in AppShell.
export function useFontScale(): void {
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      const scale = await getFontScale(db);
      document.documentElement.style.fontSize = FONT_SCALE_PCT[scale];
      localStorage.setItem(FONT_SCALE_STORAGE_KEY, scale);
    });
  }, [version]);
}
