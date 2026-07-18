'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { getRuleCatalog } from '@features/recurring/queries';
import { getBudgetCatalog } from '@features/budgets/queries';
import { getAllSettings } from './queries';
import { serializeCatalogJson } from './catalog';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

// Everything saveFile needs, so the tap passes a payload straight through without composing one.
export type BackupFile = { name: string; type: string; text: string };

export type BackupData = {
  file: BackupFile;
  entryCount: number;
  categoryCount: number;
  accountCount: number;
  budgetCount: number;
};

// One combined backup, JSON, but shipped as .txt/text/plain — NOT .json — because Chromium's shared-file
// allowlist has no JSON entry (neither '.json' nor 'application/json'), so a .json share is refused
// outright (NotAllowedError) and only ever downloads. '.txt' + 'text/plain' are both permitted, and the
// bytes are identical JSON, so the extension is the only thing that changes. That's what keeps a phone
// export reaching the share sheet (→ Drive) instead of silently falling back to a download. The type
// must stay EXACTLY 'text/plain' with no charset parameter — Chromium string-compares it, and canShare()
// does NOT run that check (it answers true either way), so a charset creeping back in breaks sharing
// silently. Restore reads the content, not the name, so a .csv or older .json/.txt still imports.
const BACKUP_MIME = 'text/plain';

// The combined backup file, serialized up front rather than on the Export tap.
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
      const [rows, categories, accounts, recurrences, budgets, settings] = await Promise.all([
        getEntries(db),
        getCategoryCatalog(db),
        getAccountCatalog(db),
        getRuleCatalog(db),
        getBudgetCatalog(db),
        getAllSettings(db),
      ]);
      if (!live) return; // a bumpDataVersion mid-read would otherwise publish the older ledger
      const day = todayIso();
      const text = serializeCatalogJson({
        version: 3,
        categories,
        accounts,
        recurrences,
        entriesCsv: serializeMonefyCsv(rows),
        budgets,
        settings,
      });
      setData({
        file: { name: `moniflow-backup-${day}.txt`, type: BACKUP_MIME, text },
        entryCount: rows.length,
        categoryCount: categories.length,
        accountCount: accounts.length,
        budgetCount: budgets.length,
      });
      setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [version]);

  return { ready, data };
}
