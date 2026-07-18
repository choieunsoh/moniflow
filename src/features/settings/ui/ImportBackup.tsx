'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { importBackupAction } from '@features/entries/actions';
import { restoreBackupAction } from '@features/settings/restore';
import { classifyBackup, type CatalogData } from '@features/settings/catalog';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { toast } from '@shared/ui/toast';

// The one Restore button, for every backup shape. classifyBackup sniffs the picked file's CONTENT
// (never its extension): a v3 combined JSON, a v1/v2 catalog JSON, or a raw Monefy CSV. A catalog-only
// file merges metadata and never deletes, so it applies straight away. Anything that REPLACES the
// ledger (the combined JSON, or a bare Monefy CSV) confirms first — the destructive replace becomes
// actionable only once a valid file is in hand, so a cancelled picker costs nothing.
type Pending = { kind: 'monefy-csv'; text: string } | { kind: 'combined'; data: CatalogData };

async function applyBackup(data: CatalogData): Promise<void> {
  try {
    const { entries, categories, accounts, budgets } = await restoreBackupAction(data);
    // entries === null → a catalog-only (v1/v2) file that carries neither a ledger nor budgets; keep
    // its toast to what it actually touched. A v3 combined file lists the ledger + budgets too.
    toast(
      entries === null
        ? `Restored ${categories} categories & ${accounts} accounts`
        : `Restored ${entries} entries, ${categories} categories, ${accounts} accounts & ${budgets} budgets`,
    );
  } catch {
    toast.error("Couldn't restore that backup — try again");
  }
}

async function applyCsv(text: string): Promise<void> {
  try {
    const { imported, skipped } = await importBackupAction(text);
    toast(`Restored ${imported} entries (${skipped} skipped)`);
  } catch {
    toast.error("Couldn't read that backup — is it a Monefy CSV?");
  }
}

export function ImportBackup() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked later
    if (!file) return;
    const text = await file.text();
    const kind = classifyBackup(text);
    if (kind.kind === 'invalid') {
      toast.error("Couldn't read that file — is it a moniflow backup or a Monefy CSV?");
      return;
    }
    if (kind.kind === 'catalog') {
      await applyBackup(kind.data); // merge-only, non-destructive → no confirm
      return;
    }
    // combined | monefy-csv both replace the ledger → gate on a confirm.
    setPending(
      kind.kind === 'combined'
        ? { kind: 'combined', data: kind.data }
        : { kind: 'monefy-csv', text },
    );
  }

  async function handleConfirm(): Promise<void> {
    if (pending === null) return;
    try {
      if (pending.kind === 'combined') {
        await applyBackup(pending.data);
      } else {
        await applyCsv(pending.text);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-fit"
        onClick={() => inputRef.current?.click()}
      >
        Restore from backup
      </button>
      <input
        ref={inputRef}
        data-testid="backup-file"
        type="file"
        // Accept every shape restore understands. .txt is what export writes (Chromium only shares
        // permitted extensions); .json/.csv stay accepted so older exports and Monefy files still
        // restore. classifyBackup decides from content — the extension never does.
        accept=".txt,.json,.csv,text/plain,application/json,text/csv"
        className="hidden"
        onChange={(e) => {
          void handleFile(e);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Replace everything with this backup?"
        body="This deletes all current entries and loads the backup's in their place. Categories and accounts are merged in, never deleted. It cannot be undone."
        confirmLabel="Replace everything"
        destructive
        onConfirm={() => {
          void handleConfirm();
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}
