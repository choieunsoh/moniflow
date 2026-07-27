'use client';

import { useEffect, useState } from 'react';
import { isStoragePersisted } from './backup-safety';

// Whether the browser has promised not to evict this origin's OPFS — the one place the app's only
// copy of the ledger lives. Post-mount and async like every other read here, because the answer comes
// from navigator.storage rather than from React.
//
// null means NOT YET KNOWN, deliberately distinct from false. Rendering "not protected" while the
// browser is still deciding states something worse than the truth about the user's data, so callers
// show nothing until this resolves.
export function useStoragePersisted(): boolean | null {
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void isStoragePersisted().then((p) => {
      if (live) setPersisted(p);
    });
    return () => {
      live = false;
    };
  }, []);

  return persisted;
}
