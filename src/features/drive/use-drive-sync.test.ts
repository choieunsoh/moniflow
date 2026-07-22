import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { restoreEntries } from '@features/entries/queries';
import { writeConnection } from './connection';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
vi.mock('./actions', () => ({ backupNow: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { backupNow } from './actions';
import { useDriveSync } from './use-drive-sync';

const ENTRY = {
  date: '2026-07-15',
  account: 'Cash',
  category: 'Coffee',
  amount: -12000,
  currency: 'THB',
  description: '',
} as const;

describe('useDriveSync', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(backupNow).mockReset().mockResolvedValue(true);
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await restoreEntries(db, [ENTRY]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('pushes on open when connected, has data, and never synced', async () => {
    writeConnection({ connected: true, folderId: 'f', lastSyncedAt: null, needsReconnect: false });
    renderHook(() => useDriveSync());
    await waitFor(() => expect(backupNow).toHaveBeenCalledWith({ interactive: false }));
  });

  it('does not push when not connected', async () => {
    renderHook(() => useDriveSync());
    await new Promise((r) => setTimeout(r, 20));
    expect(backupNow).not.toHaveBeenCalled();
  });

  it('swallows a failing auto push (never throws into render)', async () => {
    vi.mocked(backupNow).mockRejectedValue(new Error('no session'));
    writeConnection({ connected: true, folderId: 'f', lastSyncedAt: null, needsReconnect: false });
    const { result } = renderHook(() => useDriveSync());
    await waitFor(() => expect(backupNow).toHaveBeenCalled());
    expect(result.current).toBeUndefined(); // hook returns void, no throw
  });
});
