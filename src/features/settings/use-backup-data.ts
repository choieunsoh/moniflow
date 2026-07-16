'use client';

import { useEffect, useState } from 'react';
import { getBrowserDb } from '@db/browser';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { getRuleCatalog } from '@features/recurring/queries';
import { serializeCatalogJson } from './catalog';
import { todayIso } from '@shared/date';
import { useDataVersion } from '@shared/data-version';

// Everything saveFile needs, so the tap passes a payload straight through without composing one.
export type BackupFile = { name: string; type: string; text: string };

export type BackupData = {
  csv: BackupFile;
  entryCount: number;
  catalog: BackupFile;
  categoryCount: number;
  accountCount: number;
};

// The CSV's MIME must stay EXACTLY 'text/csv'. Chromium gates shared files on an allowlist and
// compares the content type with string equality (share_service_impl.cc: `if (content_type ==
// permitted)`), so 'text/csv;charset=utf-8' — what this used to send — fails the match and the share
// sheet is refused with NotAllowedError. canShare() does NOT run that check and answers true either
// way, so a charset parameter creeping back in would break sharing silently. The parameter buys
// nothing anyway: a download writes the same bytes without it.
const CSV_MIME = 'text/csv';

// The catalog is JSON but ships as .txt/text/plain, because Chromium's allowlist has no JSON entry —
// neither '.json' nor 'application/json' — so a .json share is refused outright (NotAllowedError) and
// only ever downloads. '.txt' + 'text/plain' are both permitted, and the bytes are identical JSON, so
// the extension is the only thing that changes. Restore reads the content, not the name, and its
// picker accepts both — a .json exported before this still restores.
const CATALOG_MIME = 'text/plain';

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
      const [rows, categories, accounts, recurrences] = await Promise.all([
        getEntries(db),
        getCategoryCatalog(db),
        getAccountCatalog(db),
        getRuleCatalog(db),
      ]);
      if (!live) return; // a bumpDataVersion mid-read would otherwise publish the older ledger
      const day = todayIso();
      setData({
        csv: { name: `moniflow-${day}.csv`, type: CSV_MIME, text: serializeMonefyCsv(rows) },
        entryCount: rows.length,
        catalog: {
          name: `moniflow-catalog-${day}.txt`,
          type: CATALOG_MIME,
          text: serializeCatalogJson({ version: 2, categories, accounts, recurrences }),
        },
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
