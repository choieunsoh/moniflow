'use client';

import { getBrowserDb } from '@db/browser';
import { hasAnyExpense } from '@features/entries/queries';
import { classifyBackup } from '@features/settings/catalog';
import { restoreBackupAction, type RestoreSummary } from '@features/settings/restore';
import { buildBackupText } from '@features/settings/backup-payload';
import { writeLastBackupAt } from '@shared/backup-safety';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';
import { requestToken, clearToken } from './gis';
import {
  findOrCreateFolder,
  uploadBackup,
  listBackups,
  downloadFile,
  deleteFile,
} from './drive-api';
import { readConnection, writeConnection, clearConnection } from './connection';
import { prunable, DRIVE_FOLDER_NAME, KEEP_BACKUPS, type DriveFile } from './sync-decision';

// Upload the current ledger with an already-obtained token, prune old backups, and stamp both the
// Drive lastSyncedAt and the shared last-backup timestamp (so the local overdue nudge/dot clear).
async function pushWith(token: string): Promise<void> {
  const db = await getBrowserDb();
  const conn = readConnection();
  const folderId = conn.folderId ?? (await findOrCreateFolder(token, DRIVE_FOLDER_NAME));
  const { text } = await buildBackupText(db);
  await uploadBackup(token, folderId, `moniflow-backup-${todayIso()}.txt`, text);
  const files = await listBackups(token, folderId);
  for (const id of prunable(files, KEEP_BACKUPS)) await deleteFile(token, id);
  const now = Date.now();
  writeConnection({ connected: true, folderId, lastSyncedAt: now, needsReconnect: false });
  writeLastBackupAt(now);
  bumpDataVersion();
}

export async function connectDrive(): Promise<void> {
  const token = await requestToken({ interactive: true });
  const db = await getBrowserDb();
  if (await hasAnyExpense(db)) {
    await pushWith(token);
  } else {
    const folderId = await findOrCreateFolder(token, DRIVE_FOLDER_NAME);
    const conn = readConnection();
    writeConnection({ ...conn, connected: true, folderId, needsReconnect: false });
    bumpDataVersion();
  }
}

export function disconnectDrive(): void {
  clearConnection();
  clearToken(); // drop the cached access token too — disconnect should require a fresh grant
  bumpDataVersion();
}

// Returns true when a backup was actually uploaded, false when it no-op'd because the ledger is empty
// (nothing to lose). The manual "Back up now" tap uses this to avoid claiming success on an empty
// ledger; the auto-sync path ignores it. A token failure still throws (and flags needsReconnect).
export async function backupNow(opts: { interactive: boolean }): Promise<boolean> {
  const db = await getBrowserDb();
  if (!(await hasAnyExpense(db))) return false; // nothing to lose
  let token: string;
  try {
    token = await requestToken({ interactive: opts.interactive });
  } catch (err) {
    const conn = readConnection();
    writeConnection({ ...conn, needsReconnect: true });
    bumpDataVersion();
    throw err;
  }
  await pushWith(token);
  return true;
}

export async function listDriveBackups(): Promise<DriveFile[]> {
  const token = await requestToken({ interactive: false });
  const conn = readConnection();
  const folderId = conn.folderId ?? (await findOrCreateFolder(token, DRIVE_FOLDER_NAME));
  return listBackups(token, folderId);
}

export async function restoreFromDrive(fileId: string): Promise<RestoreSummary> {
  const token = await requestToken({ interactive: false });
  const text = await downloadFile(token, fileId);
  const kind = classifyBackup(text);
  if (kind.kind !== 'combined' && kind.kind !== 'catalog') {
    throw new Error('That file is not a moniflow backup');
  }
  return restoreBackupAction(kind.data); // reuses replace-all + bumpDataVersion
}
