import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { addEntries } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useHome } from './use-home';

describe('useHome', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureBudgetsTable(db);
    // Cutoff defaults to 18, so 2026-07-01 falls in the cycle keyed '2026-06'.
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-02', account: 'Cash', category: 'Food', amount: -50 },
      { date: '2026-07-03', account: 'Cash', category: 'Transport', amount: -20 },
    ]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads the cycle summary + donut slices from the seeded ledger', async () => {
    const { result } = renderHook(() => useHome('2026-06'));
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.activeKey).toBe('2026-06');
    expect(data.summary.count).toBe(3);
    expect(data.total).toBe(170);
    expect(data.slices.map((s) => s.name).sort()).toEqual(['Food', 'Transport']);
    const food = data.slices.find((s) => s.name === 'Food');
    expect(food?.value).toBe(150);
    expect(food?.count).toBe(2);
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useHome('2026-06'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.summary.count).toBe(3);

    const db = await getBrowserDb();
    await addEntries(db, [{ date: '2026-07-04', account: 'Cash', category: 'Food', amount: -30 }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.summary.count).toBe(4));
    expect(result.current.data?.total).toBe(200);
  });
});
