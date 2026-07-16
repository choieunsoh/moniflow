import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { restoreEntries } from '@features/entries/queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useBackupData } from './use-backup-data';

const ENTRY = {
  date: '2026-07-15',
  account: 'Cash',
  category: 'Coffee',
  amount: -12000,
  currency: 'THB',
  description: '',
} as const;

describe('useBackupData', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  // The whole point of the hook: the files exist before any tap, so the click handler can reach
  // navigator.share() synchronously and keep the gesture's transient activation.
  it('serializes both files up front so no read is needed on the tap', async () => {
    const db = await getBrowserDb();
    await restoreEntries(db, [ENTRY]);

    const { result } = renderHook(() => useBackupData());
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — ready implies data');

    expect(data.entryCount).toBe(1);
    expect(data.csv.text).toContain('Coffee');
    expect(data.csv.text.split('\n')[0]).toContain('date'); // the Monefy header row
    expect(data.csv.name).toMatch(/^moniflow-\d{4}-\d{2}-\d{2}\.csv$/); // .csv earns the allowlist
    expect(JSON.parse(data.catalog.text)).toMatchObject({ version: 2 });
  });

  // Both files must clear Chromium's shared-file allowlist, which string-compares the content type
  // and the extension. A charset parameter, or .json/application/json, fails the match and the share
  // sheet is refused with NotAllowedError — while canShare() still answers true, so nothing surfaces
  // but a silent download. Only a real phone ever notices, hence these two assertions.
  it('names and types both files so Chromium will put them in the share sheet', async () => {
    const { result } = renderHook(() => useBackupData());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — ready implies data');

    expect(data.csv.type).toBe('text/csv'); // NOT 'text/csv;charset=utf-8'
    expect(data.catalog.type).toBe('text/plain'); // NOT 'application/json'
    expect(data.catalog.name).toMatch(/\.txt$/); // NOT .json — it is JSON, under a shareable name
  });

  it('re-serializes when the data-version bumps, so a restore cannot leave a stale file', async () => {
    const { result } = renderHook(() => useBackupData());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.entryCount).toBe(0);

    const db = await getBrowserDb();
    await restoreEntries(db, [ENTRY, { ...ENTRY, category: 'Food' }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.entryCount).toBe(2));
    expect(result.current.data?.csv.text).toContain('Food');
  });
});
