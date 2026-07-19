'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';

// Can the app open its database at all?
//
// OPFS hands its exclusive access handle to ONE holder, so a second tab on the same origin cannot
// boot the db. That is a routine thing for a user to do — reopen a bookmark, restore a session — and
// it used to strand that tab on the loading skeleton with no message and no way back, because the
// worker never reported the failed boot and getBrowserDb() memoised the dead promise. With both of
// those fixed the failure now surfaces as a rejection; this turns it into something the shell can
// say out loud, and `retry` into something that can actually succeed once the other tab closes.
//
// Deliberately mounted once in AppShell rather than per page: the db is app-wide, so one check and
// one message beats teaching every read hook its own error state.
export function useDbHealth(): { checked: boolean; failed: boolean; retry: () => void } {
  const [checked, setChecked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    getBrowserDb().then(
      () => {
        if (!alive) return;
        setFailed(false);
        setChecked(true);
      },
      () => {
        if (!alive) return;
        setFailed(true);
        setChecked(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { checked, failed, retry };
}
