import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { restoreEntries } from '@features/entries/queries';
import { readConnection } from './connection';
import { readLastBackupAt } from '@shared/backup-safety';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
vi.mock('./gis', () => ({ requestToken: vi.fn() }));
vi.mock('./drive-api', () => ({
  findOrCreateFolder: vi.fn(),
  uploadBackup: vi.fn(),
  listBackups: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

import { getBrowserDb } from '@db/browser';
import { requestToken } from './gis';
import { findOrCreateFolder, uploadBackup, listBackups, deleteFile } from './drive-api';
import { backupNow } from './actions';

const ENTRY = {
  date: '2026-07-15',
  account: 'Cash',
  category: 'Coffee',
  amount: -12000,
  currency: 'THB',
  description: '',
} as const;

describe('backupNow', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    await ensureBudgetsTable(db);
    await ensureSettingsTable(db);
    await restoreEntries(db, [ENTRY]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
    vi.mocked(requestToken).mockResolvedValue('tok');
    vi.mocked(findOrCreateFolder).mockResolvedValue('fold1');
    vi.mocked(uploadBackup).mockResolvedValue(undefined);
    vi.mocked(listBackups).mockResolvedValue([]);
    vi.mocked(deleteFile).mockResolvedValue(undefined);
  });

  it('uploads, stamps lastSyncedAt AND the local backup timestamp, and clears needsReconnect', async () => {
    await backupNow({ interactive: false });
    expect(uploadBackup).toHaveBeenCalledTimes(1);
    const conn = readConnection();
    expect(conn.connected).toBe(true);
    expect(conn.folderId).toBe('fold1');
    expect(conn.lastSyncedAt).not.toBeNull();
    expect(conn.needsReconnect).toBe(false);
    expect(readLastBackupAt()).not.toBeNull(); // local nudge cleared too
  });

  it('marks needsReconnect and rethrows when the silent token fails', async () => {
    vi.mocked(requestToken).mockRejectedValue(new Error('no session'));
    await expect(backupNow({ interactive: false })).rejects.toThrow('no session');
    expect(readConnection().needsReconnect).toBe(true);
    expect(uploadBackup).not.toHaveBeenCalled();
  });

  it('does nothing when the ledger is empty', async () => {
    const empty = makeNodeProxyDb();
    await ensureEntriesTable(empty);
    await ensureCategoriesTable(empty);
    await ensureAccountsTable(empty);
    await ensureRecurrencesTable(empty);
    await ensureBudgetsTable(empty);
    await ensureSettingsTable(empty);
    vi.mocked(getBrowserDb).mockResolvedValue(empty);
    await backupNow({ interactive: false });
    expect(uploadBackup).not.toHaveBeenCalled();
  });
});
