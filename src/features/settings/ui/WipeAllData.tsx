'use client';

import { useState } from 'react';
import { wipeAllDataAction } from '@features/settings/actions';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { toast } from '@shared/ui/toast';

// The first real ConfirmDialog caller: a destructive "Wipe all data" button gated by a confirm.
// On confirm, run the server action then toast. (Concern #3's Drive restore reuses this same
// ConfirmDialog for its overwrite gate.)
export function WipeAllData() {
  const [open, setOpen] = useState(false);

  async function handleConfirm(): Promise<void> {
    try {
      await wipeAllDataAction();
      toast('All data cleared');
    } catch {
      toast.error('Failed to wipe data — try again');
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-fit"
        style={{ color: 'var(--color-loss)' }}
        onClick={() => setOpen(true)}
      >
        Wipe all data
      </button>
      <ConfirmDialog
        open={open}
        title="Wipe all data?"
        body="Delete all entries, categories, and budgets. This cannot be undone."
        confirmLabel="Delete everything"
        destructive
        onConfirm={() => {
          void handleConfirm();
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
