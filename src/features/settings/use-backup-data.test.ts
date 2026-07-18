import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from './schema';
import { restoreEntries } from '@features/entries/queries';
import { setBudget } from '@features/budgets/queries';
import { setCutoff } from './queries';
import { parseCatalogJson } from './catalog';
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
    await ensureBudgetsTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  // The whole point of the hook: the file exists before any tap, so the click handler can reach
  // navigator.share() synchronously and keep the gesture's transient activation.
  it('serializes one combined v3 file up front so no read is needed on the tap', async () => {
    const db = await getBrowserDb();
    await restoreEntries(db, [ENTRY]);
    await setBudget(db, 'Coffee', 5000); // a per-category budget rides along
    await setCutoff(db, 18); // a settings KV row rides along

    const { result } = renderHook(() => useBackupData());
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — ready implies data');

    expect(data.entryCount).toBe(1);
    expect(data.budgetCount).toBe(1);
    const parsed = parseCatalogJson(data.file.text);
    if (parsed === null) throw new Error('expected a valid v3 backup');
    expect(parsed.version).toBe(3);
    // The whole ledger rides along as an embedded Monefy CSV (header + the one entry).
    expect(parsed.entriesCsv).toContain('Coffee');
    expect(parsed.entriesCsv?.split('\n')[0]).toContain('date'); // the Monefy header row
    // Budgets and settings ride along as their own rows.
    expect(parsed.budgets).toEqual([{ category: 'Coffee', amount: 5000 }]);
    expect(parsed.settings).toEqual([{ key: 'cutoff_day', value: '18' }]);
    expect(data.file.name).toMatch(/^moniflow-backup-\d{4}-\d{2}-\d{2}\.txt$/);
  });

  // The file must clear Chromium's shared-file allowlist, which string-compares the content type and
  // the extension. A charset parameter, or .json/application/json, fails the match and the share sheet
  // is refused with NotAllowedError — while canShare() still answers true, so nothing surfaces but a
  // silent download. Only a real phone ever notices, hence these assertions.
  it('names and types the file so Chromium will put it in the share sheet', async () => {
    const { result } = renderHook(() => useBackupData());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — ready implies data');

    expect(data.file.type).toBe('text/plain'); // NOT 'application/json', NOT a charset parameter
    expect(data.file.name).toMatch(/\.txt$/); // NOT .json — it is JSON, under a shareable name
  });

  it('re-serializes when the data-version bumps, so a restore cannot leave a stale file', async () => {
    const { result } = renderHook(() => useBackupData());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.entryCount).toBe(0);

    const db = await getBrowserDb();
    await restoreEntries(db, [ENTRY, { ...ENTRY, category: 'Food' }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.entryCount).toBe(2));
    expect(result.current.data?.file.text).toContain('Food');
  });
});
