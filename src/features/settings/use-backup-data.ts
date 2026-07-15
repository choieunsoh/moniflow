'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { serializeCatalogJson } from './catalog';
import { useDataVersion } from '@shared/data-version';

export type BackupData = {
  csv: string;
  entryCount: number;
  catalogJson: string;
  categoryCount: number;
  accountCount: number;
};

// Both backup files, serialized up front rather than on the Export tap.
//
// This exists for one reason: navigator.share() must be called while the tap's transient user
// activation is still live, and Android Chrome rejects it with NotAllowedError if anything is
// awaited first. Reading OPFS inside the click handler — which is what /settings used to do — is
// exactly that "anything", so the sheet never opened and the export silently fell back to a
// download. With the text already in hand, the handler can reach navigator.share synchronously.
//
// The cost is reading the ledger on every /settings mount instead of on demand. That's fine here:
// the page already fires six reads on mount, a personal ledger is small, and Settings is a page you
// visit rarely. Re-serializes on bumpDataVersion() so a restore/wipe can't leave a stale file behind.
export function useBackupData(): { ready: boolean; data: BackupData | null } {
  const [data, setData] = useState<BackupData | null>(null);
  const [ready, setReady] = useState(false);
  const version = useDataVersion();

  useEffect(() => {
    let live = true;
    void (async () => {
      setReady(false);
      const db = await getBrowserDb();
      const [rows, categories, accounts] = await Promise.all([
        getEntries(db),
        getCategoryCatalog(db),
        getAccountCatalog(db),
      ]);
      if (!live) return; // a bumpDataVersion mid-read would otherwise publish the older ledger
      setData({
        csv: serializeMonefyCsv(rows),
        entryCount: rows.length,
        catalogJson: serializeCatalogJson({ version: 1, categories, accounts }),
        categoryCount: categories.length,
        accountCount: accounts.length,
      });
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [version]);

  return { ready, data };
}
