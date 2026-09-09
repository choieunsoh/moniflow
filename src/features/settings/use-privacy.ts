'use client';

import { useEffect } from 'react';
import { withDb } from '@shared/db-effect';
import { getPrivacy } from './queries';
import { DEFAULT_PRIVACY, PRIVACY_STORAGE_KEY, type Privacy } from './theme';
import { useDataVersion } from '@shared/data-version';

// Privacy's half of the appearance stamp, and the exact shape of useTheme: OPFS is the source of
// truth, <html> carries the applied state, and localStorage carries a copy the pre-paint script in
// layout.tsx reads before any bundle loads.
//
// That pre-paint copy is the feature, not an optimisation. Reads here are async and post-mount, so
// without it every app open paints the real balance for the length of an OPFS round trip and only
// then hides it. A privacy mode with a flash of the truth is not a privacy mode.
//
// Peek lives here too: one delegated listener, because press-and-hold has to work over a chart as
// well, and DonutChart's root is pointer-events-none (it lets a swipe through to the cycle-swipe
// wrapper) so the chart can never be the element you press. Holding ANY figure clears the blur
// everywhere, which is what makes a blurred chart readable at all.
export function usePrivacy(): void {
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      const privacy = await getPrivacy(db);
      applyPrivacy(privacy);
      localStorage.setItem(PRIVACY_STORAGE_KEY, privacy);
    });
  }, [version]);

  useEffect(() => {
    function down(e: PointerEvent): void {
      const target = e.target;
      if (target instanceof Element && target.closest('.money') !== null) {
        document.documentElement.dataset.peek = '';
      }
    }
    function up(): void {
      delete document.documentElement.dataset.peek;
    }
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
    };
  }, []);
}

// Exported so the toggle can stamp optimistically on click without waiting for the write to reach
// OPFS and the data-version bump to come back around. The hook remains the only writer of the CACHE.
export function applyPrivacy(privacy: Privacy): void {
  if (privacy === DEFAULT_PRIVACY) delete document.documentElement.dataset.privacy;
  else document.documentElement.dataset.privacy = privacy;
}
