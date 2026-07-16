'use client';

import { useEffect } from 'react';
import { getBrowserDb } from '@db/browser';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';
import { runSweep } from './sweep';

// Opening the app is the scheduler (there is no server). Called once from the shell.
//
// Memoized behind a module-level promise — the same shape getBrowserDb() uses — so React strict
// mode's double-invoke awaits the same sweep instead of running two. That is an optimisation, not a
// correctness requirement: the pointer already makes a second sweep a no-op.
let sweepPromise: Promise<number> | null = null;

function sweepOnce(): Promise<number> {
  sweepPromise ??= getBrowserDb().then((db) => runSweep(db, todayIso()));
  return sweepPromise;
}

export function useRecurringSweep(): void {
  useEffect(() => {
    // Read hooks mount and fetch concurrently with this, so a first paint can briefly show
    // pre-sweep numbers; the bump then triggers the refetch. Self-correcting, and consistent with
    // the app's post-mount async read model.
    void sweepOnce()
      .then((posted) => {
        if (posted > 0) bumpDataVersion();
      })
      .catch(() => {
        // A failed sweep must never take the shell down. runSweep already isolates per-rule
        // failures; reaching here means the db itself is unavailable, which every read hook will
        // surface on its own.
      });
  }, []);
}
