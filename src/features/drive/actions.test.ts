import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { restoreEntries, getEntries } from '@features/entries/queries';
import { readConnection, writeConnection } from './connection';
import { readLastBackupAt } from '@shared/backup-safety';
import { buildBackupText } from '@features/settings/backup-payload';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
vi.mock('./gis', () => ({
  requestToken: vi.fn(),
  revokeAccess: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./drive-api', () => ({
  findOrCreateFolder: vi.fn(),
  uploadBackup: vi.fn(),
  listBackups: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

import { getBrowserDb } from '@db/browser';
import { requestToken } from './gis';
import {
  findOrCreateFolder,
  uploadBackup,
  listBackups,
  downloadFile,
  deleteFile,
} from './drive-api';
import { backupNow, restoreFromDrive } from './actions';

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
    await ensureCurrenciesTable(db);
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
    writeConnection({ connected: true, folderId: null, lastSyncedAt: null, needsReconnect: true });
    expect(await backupNow({ interactive: false })).toBe(true); // uploaded → true
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
    await ensureCurrenciesTable(empty);
    await ensureSettingsTable(empty);
    vi.mocked(getBrowserDb).mockResolvedValue(empty);
    expect(await backupNow({ interactive: false })).toBe(false); // empty ledger → no-op, returns false
    expect(uploadBackup).not.toHaveBeenCalled();
    expect(requestToken).not.toHaveBeenCalled(); // empty ledger never prompts for auth
  });
});

describe('restoreFromDrive', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    await ensureBudgetsTable(db);
    await ensureCurrenciesTable(db);
    await ensureSettingsTable(db);
    await restoreEntries(db, [ENTRY]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
    vi.mocked(requestToken).mockResolvedValue('tok');
  });

  it('rejects a non-backup file before touching the ledger — no data loss', async () => {
    vi.mocked(downloadFile).mockResolvedValue('this is not a backup');
    await expect(restoreFromDrive('some-id')).rejects.toThrow('That file is not a moniflow backup');
    const db = await getBrowserDb();
    const rows = await getEntries(db);
    expect(rows).toHaveLength(1); // untouched — the seeded ENTRY survives the failed restore
    expect(rows[0]?.category).toBe('Coffee');
  });

  it('restores a real combined backup', async () => {
    const sourceDb = makeNodeProxyDb();
    await ensureEntriesTable(sourceDb);
    await ensureCategoriesTable(sourceDb);
    await ensureAccountsTable(sourceDb);
    await ensureRecurrencesTable(sourceDb);
    await ensureBudgetsTable(sourceDb);
    await ensureCurrenciesTable(sourceDb);
    await ensureSettingsTable(sourceDb);
    await restoreEntries(sourceDb, [{ ...ENTRY, category: 'Rent', amount: -50000 }]);
    const { text } = await buildBackupText(sourceDb);
    vi.mocked(downloadFile).mockResolvedValue(text);

    const summary = await restoreFromDrive('some-id');

    expect(summary.entries).toBe(1);
    const db = await getBrowserDb();
    const rows = await getEntries(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('Rent');
  });
});
