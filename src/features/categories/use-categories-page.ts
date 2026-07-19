'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getCategoryCounts, type CategoryCount } from '@features/entries/queries';
import { getKeypadCategories } from '@features/entries/keypad-lists';
import type { KeypadCategory } from '@features/entries/ui/Keypad';
import { getEmojiMap, getHueMap } from './queries';
import { getIconSet, type IconSet } from '@features/settings/queries';
import { useDataVersion } from '@shared/data-version';

export type CategoriesPageData = {
  counts: CategoryCount[];
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  keypadCategories: KeypadCategory[];
};

// Categories page's list data, read once via the browser OPFS db after mount — mirrors the server
// computation the page used to run in a Server Component, just moved client-side + async. No URL
// inputs of its own; re-runs whenever the data-version counter bumps (add/rename/delete/reorder).
export function useCategoriesPage(): { ready: boolean; data: CategoriesPageData | null } {
  const [data, setData] = useState<CategoriesPageData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      // Deliberately no setReady(false) here: a version bump refetches, it does not un-load the page.
      // Dropping back to `ready: false` sent the page through its !ready branch on every mutation,
      // unmounting the whole tree — which silently closed the reorder sheet (an open <dialog> can't
      // survive its node being replaced) on the very drop that persisted the order. Keeping the last
      // data on screen while the refetch runs is also one less flash per rename/delete/add.
      const [counts, emojiMap, hueMap, iconSet, keypadCategories] = await Promise.all([
        getCategoryCounts(db),
        getEmojiMap(db),
        getHueMap(db),
        getIconSet(db),
        getKeypadCategories(db),
      ]);

      setData({ counts, emojiMap, hueMap, iconSet, keypadCategories });
      setReady(true);
    });
  }, [version]);

  return { ready, data };
}
