import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from '@features/entries/queries';
import { cycleOf } from '@features/entries/cycle';
import { todayIso } from '@shared/date';
import { setAccountIcon } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useAccountsPage } from './use-accounts-page';

// Anchored to the real current cycle (default cutoff 18) so the breakdown — which always reads the
// *current* cycle, unlike the cycle-param'd pages — actually contains the seeded rows regardless of
// what day the test runs.
const cycleStart = cycleOf(todayIso()).start;

describe('useAccountsPage', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await addEntries(db, [
      { date: cycleStart, account: 'Cash', category: 'Food', amount: -100 },
      { date: cycleStart, account: 'Cash', category: 'Food', amount: -50 },
      { date: cycleStart, account: 'KBank', category: 'Transport', amount: -20 },
    ]);
    await setAccountIcon(db, 'Cash', 'cash');
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads account counts + current-cycle breakdown from the seeded ledger', async () => {
    const { result } = renderHook(() => useAccountsPage());
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.counts.map((c) => c.account).sort()).toEqual(['Cash', 'KBank']);
    const cash = data.counts.find((c) => c.account === 'Cash');
    expect(cash?.count).toBe(2);
    expect(data.iconMap.Cash).toBe('cash');
    expect(data.breakdown.map((b) => b.key).sort()).toEqual(['Cash', 'KBank']);
    expect(data.keypadAccounts.map((a) => a.name).sort()).toEqual(['Cash', 'KBank']);
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useAccountsPage());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.counts.length).toBe(2);

    const db = await getBrowserDb();
    await addEntries(db, [{ date: cycleStart, account: 'SCB', category: 'Bills', amount: -30 }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.counts.length).toBe(3));
  });
});
