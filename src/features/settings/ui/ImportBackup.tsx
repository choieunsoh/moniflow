'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { importBackupAction } from '@features/entries/actions';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { toast } from '@shared/ui/toast';

// Restore the ledger from a Monefy-compatible CSV. The file is read in the browser (file.text()) so
// the Server Action takes a plain string — no multipart plumbing. Confirm fires AFTER a file is picked
// (never before): the destructive replace-all only becomes actionable once a valid replacement is in
// hand, so a cancelled picker costs nothing. Mirrors WipeAllData's confirm+toast pattern.
export function ImportBackup() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked later
    if (!file) return;
    setPending(await file.text());
  }

  async function handleConfirm(): Promise<void> {
    if (pending === null) return;
    try {
      const { imported, skipped } = await importBackupAction(pending);
      toast(`Restored ${imported} entries (${skipped} skipped)`);
    } catch {
      toast.error("Couldn't read that backup — is it a Monefy CSV?");
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
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          void handleFile(e);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Replace everything with this backup?"
        body="This deletes all current entries and loads the file in their place. It cannot be undone."
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
