import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { restoreEntries } from '@features/entries/queries';
import { bumpDataVersion } from '@shared/data-version';
import { writeLastBackupAt, OVERDUE_DAYS } from './backup-safety';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useBackupStatus } from './use-backup-status';

const ENTRY = {
  date: '2026-07-15',
  account: 'Cash',
  category: 'Coffee',
  amount: -12000,
  currency: 'THB',
  description: '',
} as const;

const DAY = 86_400_000;

describe('useBackupStatus', () => {
  beforeEach(async () => {
    localStorage.clear();
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  // A fresh, empty ledger is never nagged — there is nothing to lose yet.
  it('is not overdue when the ledger is empty', async () => {
    const { result } = renderHook(() => useBackupStatus());
    await waitFor(() => expect(result.current).toEqual({ overdue: false, daysSince: null }));
  });

  // Data present + never backed up = overdue, and daysSince stays null until the first export.
  it('is overdue when there is data and no backup has ever been made', async () => {
    const db = await getBrowserDb();
    await restoreEntries(db, [ENTRY]);

    const { result } = renderHook(() => useBackupStatus());
    await waitFor(() => expect(result.current.overdue).toBe(true));
    expect(result.current.daysSince).toBeNull();
  });

  // A stale timestamp past the threshold is overdue; the bump re-reads localStorage and clears it —
  // proving the export path (stamp then bump) makes both consumers refresh.
  it('clears the moment a backup is stamped and the data-version bumps', async () => {
    const db = await getBrowserDb();
    await restoreEntries(db, [ENTRY]);
    writeLastBackupAt(Date.now() - (OVERDUE_DAYS + 5) * DAY);

    const { result } = renderHook(() => useBackupStatus());
    await waitFor(() => expect(result.current.overdue).toBe(true));

    act(() => {
      writeLastBackupAt(Date.now());
      bumpDataVersion();
    });
    await waitFor(() => expect(result.current.overdue).toBe(false));
    expect(result.current.daysSince).toBe(0);
  });
});
