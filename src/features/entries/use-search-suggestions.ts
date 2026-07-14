'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getDistinctCategories, getDistinctAccounts } from './queries';
import { getIconSet, type IconSet } from '@features/settings/queries';

// Header search's autocomplete pool (distinct categories + accounts, de-duped/sorted) plus the
// active icon set, both DB-derived — read once via the browser OPFS db after mount. `ready` lets
// AppShell render the frame immediately and fill the pool in a tick, instead of blocking first paint.
export function useSearchSuggestions(): {
  suggestions: string[];
  iconSet: IconSet;
  ready: boolean;
} {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [iconSet, setIconSet] = useState<IconSet>('emoji');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const db = await getBrowserDb();
      const [cats, accts, icons] = await Promise.all([
        getDistinctCategories(db),
        getDistinctAccounts(db),
        getIconSet(db),
      ]);
      setSuggestions([...new Set([...cats, ...accts])].sort());
      setIconSet(icons);
      setReady(true);
    })();
  }, []);

  return { suggestions, iconSet, ready };
}
