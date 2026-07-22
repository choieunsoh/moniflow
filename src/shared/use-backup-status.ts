'use client';

import { useEffect, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { hasAnyExpense } from '@features/entries/queries';
import { useDataVersion } from '@shared/data-version';
import { backupStatus, readLastBackupAt, type BackupStatus } from './backup-safety';

// App-wide backup-freshness signal — the moniflow equivalent of kapsoon's single `backup` field on
// its mega-hook. Folds two inputs through the pure backupStatus() decision: whether the ledger has
// anything to lose (hasAnyExpense, from OPFS, post-mount) and the last-export timestamp (localStorage).
//
// One source of truth: the timestamp is localStorage and the logic is the pure fn, so the two
// consumers — the More-tab dot and the Settings nudge — can each call this hook and never diverge.
// Recomputes on bumpDataVersion(), which the export handler fires after stamping the timestamp, so a
// successful backup clears both the nudge and the dot without a reload.
export function useBackupStatus(): BackupStatus {
  const [status, setStatus] = useState<BackupStatus>({ overdue: false, daysSince: null });
  const version = useDataVersion();

  useEffect(() => {
    let live = true;
    void withDb(async (db) => {
      const hasData = await hasAnyExpense(db);
      if (!live) return; // a mid-read bump would otherwise publish against a stale timestamp
      setStatus(backupStatus(readLastBackupAt(), Date.now(), hasData ? 1 : 0));
    });
    return () => {
      live = false;
    };
  }, [version]);

  return status;
}
