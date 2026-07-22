'use client';

import { useEffect } from 'react';
import { withDb } from '@shared/db-effect';
import { hasAnyExpense } from '@features/entries/queries';
import { readConnection } from './connection';
import { shouldAutoSync, STALE_HOURS } from './sync-decision';
import { backupNow } from './actions';

// App-open Drive sync. Mounted once in AppShell — "opening the app is the schedule" (like
// useRecurringSweep). Strictly fire-and-forget: reads connection + hasData, and if stale enough,
// silently pushes. Any failure (auth/network) is swallowed here — backupNow already recorded
// needsReconnect where relevant, and the local overdue nudge remains the visible fallback.
export function useDriveSync(): void {
  useEffect(() => {
    let alive = true;
    void (async () => {
      const conn = readConnection();
      if (!conn.connected) return;
      let hasData = false;
      await withDb(async (db) => {
        hasData = await hasAnyExpense(db);
      });
      if (!alive) return;
      if (
        !shouldAutoSync({
          connected: conn.connected,
          hasData,
          lastSyncedAt: conn.lastSyncedAt,
          now: Date.now(),
          staleHours: STALE_HOURS,
        })
      ) {
        return;
      }
      try {
        await backupNow({ interactive: false });
      } catch {
        // quiet degrade — see the comment above
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
}
