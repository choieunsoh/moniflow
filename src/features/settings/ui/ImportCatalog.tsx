'use client';

import { useRef, type ChangeEvent } from 'react';
import { getBrowserDb } from '@db/browser';
import { parseCatalogJson } from '@features/settings/catalog';
import { restoreCategoryCatalog } from '@features/categories/queries';
import { restoreAccountCatalog } from '@features/accounts/queries';
import { restoreRecurrencesFromCatalog } from '@features/recurring/queries';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';
import { toast } from '@shared/ui/toast';

// Restore category/account display metadata (emoji/hue/order/archived, icon/hue/order) from the
// JSON that "Export categories & accounts" produced. Upsert-by-name (never deletes), so no destructive
// confirm — unlike the replace-all CSV restore. Read in the browser (file.text()), applied to OPFS.
export function ImportCatalog() {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const data = parseCatalogJson(await file.text());
    if (data === null) {
      toast.error("Couldn't read that file — is it a moniflow catalog JSON?");
      return;
    }
    try {
      const db = await getBrowserDb();
      await restoreCategoryCatalog(db, data.categories);
      await restoreAccountCatalog(db, data.accounts);
      await restoreRecurrencesFromCatalog(db, data.recurrences, todayIso());
      bumpDataVersion();
      toast('Categories, accounts & rules restored');
    } catch {
      toast.error("Couldn't restore categories & accounts — try again");
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-fit"
        onClick={() => inputRef.current?.click()}
      >
        Restore categories &amp; accounts
      </button>
      <input
        ref={inputRef}
        data-testid="catalog-file"
        type="file"
        // .txt is what the export writes (Chromium only shares permitted extensions, and .json isn't
        // one); .json stays accepted so backups taken before that rename still restore. The parse is
        // content-based either way — the extension never decides anything here.
        accept=".txt,.json,text/plain,application/json"
        className="hidden"
        onChange={(e) => {
          void handleFile(e);
        }}
      />
    </>
  );
}
