'use client';

import { useState } from 'react';
import { useDriveStatus } from '../use-drive-status';
import {
  connectDrive,
  disconnectDrive,
  backupNow,
  listDriveBackups,
  restoreFromDrive,
} from '../actions';
import type { DriveFile } from '../sync-decision';
import { toast } from '@shared/ui/toast';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';

const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

// "N minutes/hours/days ago" from an epoch-ms, using Intl (no string math).
function agoLabel(at: number): string {
  const mins = Math.round((at - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rel.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rel.format(hours, 'hour');
  return rel.format(Math.round(hours / 24), 'day');
}

export function DriveBackup() {
  const status = useDriveStatus();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<DriveFile[] | null>(null);
  const [confirmFile, setConfirmFile] = useState<DriveFile | null>(null);

  if (!status.configured) return null; // feature hidden without a client id

  async function run(fn: () => Promise<void>, okToast?: string): Promise<void> {
    setBusy(true);
    try {
      await fn();
      if (okToast !== undefined) toast(okToast);
    } catch {
      toast.error('Drive request failed — reconnect and try again');
    } finally {
      setBusy(false);
    }
  }

  async function openPicker(): Promise<void> {
    setBusy(true);
    try {
      setPicking(await listDriveBackups());
    } catch {
      toast.error('Could not list Drive backups — reconnect and try again');
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(file: DriveFile): Promise<void> {
    setConfirmFile(null);
    setPicking(null);
    setBusy(true);
    try {
      const s = await restoreFromDrive(file.id);
      toast(
        s.entries === null
          ? `Restored ${s.categories} categories & ${s.accounts} accounts`
          : `Restored ${s.entries} entries, ${s.categories} categories, ${s.accounts} accounts & ${s.budgets} budgets`,
      );
    } catch {
      toast.error("Couldn't restore that Drive backup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 border-t pt-4"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <h3 className="text-sm font-semibold">Google Drive</h3>

      {!status.connected ? (
        <>
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            Connect Google Drive to back up automatically when you open the app. Backups go to a
            &ldquo;Moniflow Backups&rdquo; folder you can see and download yourself.
          </p>
          <button
            type="button"
            className="btn btn-primary w-fit"
            disabled={busy}
            onClick={() => void run(connectDrive, 'Connected to Google Drive')}
          >
            {busy ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {status.needsReconnect
              ? 'Reconnect Drive — the connection lapsed.'
              : status.lastSyncedAt === null
                ? 'Connected. No backup yet.'
                : `Backed up to Drive ${agoLabel(status.lastSyncedAt)}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost w-fit"
              disabled={busy}
              onClick={() => void run(() => backupNow({ interactive: true }), 'Backed up to Drive')}
            >
              Back up now
            </button>
            <button
              type="button"
              className="btn btn-ghost w-fit"
              disabled={busy}
              onClick={() => void openPicker()}
            >
              Restore from Drive
            </button>
            <button
              type="button"
              className="btn btn-ghost w-fit"
              disabled={busy}
              onClick={() => {
                disconnectDrive();
                toast('Disconnected from Drive');
              }}
            >
              Disconnect
            </button>
          </div>

          {picking !== null ? (
            <ul className="flex flex-col gap-1" data-testid="drive-picker">
              {picking.length === 0 ? (
                <li className="text-xs" style={{ color: 'var(--color-faint)' }}>
                  No backups in Drive yet.
                </li>
              ) : (
                picking.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="btn btn-ghost w-full justify-start"
                      onClick={() => setConfirmFile(f)}
                    >
                      {f.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmFile !== null}
        title="Replace everything with this Drive backup?"
        body="This deletes all current entries and loads the backup's in their place. Categories and accounts are merged in, never deleted. It cannot be undone."
        confirmLabel="Replace everything"
        destructive
        onConfirm={() => {
          if (confirmFile !== null) void doRestore(confirmFile);
        }}
        onClose={() => setConfirmFile(null)}
      />
    </div>
  );
}
