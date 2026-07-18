import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { addEntries } from './queries';
import { setBudget } from '@features/budgets/queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// Fix "today" so the current-cycle math is deterministic. Cutoff 18 → 2026-07-20 is day 3 of the
// cycle keyed '2026-07' (2026-07-18 → 2026-08-17, 31 days). Keep the other date helpers real.
vi.mock('@shared/date', async (importActual) => ({
  ...(await importActual<typeof import('@shared/date')>()),
  todayIso: () => '2026-07-20',
}));

import { getBrowserDb } from '@db/browser';
import { useDashboard } from './use-dashboard';

describe('useDashboard', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureBudgetsTable(db);
    await addEntries(db, [
      // Current cycle '2026-07' (18 Jul → 17 Aug): 180 spent over 3 entries.
      { date: '2026-07-18', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-19', account: 'Cash', category: 'Food', amount: -50 },
      { date: '2026-07-20', account: 'Cash', category: 'Transport', amount: -30 },
      // Previous cycle '2026-06' (18 Jun → 17 Jul): 200 spent.
      { date: '2026-06-20', account: 'Cash', category: 'Food', amount: -200 },
    ]);
    await setBudget(db, null, 3000); // total budget
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('loads current-cycle figures, projection, and vs-last delta', async () => {
    const { result } = renderHook(() => useDashboard());
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    if (data === null) throw new Error('unreachable — ready implies data');

    expect(data.currentKey).toBe('2026-07');
    expect(data.total).toBe(180);
    expect(data.count).toBe(3);
    expect(data.totalBudget).toBe(3000);
    expect(data.daysElapsed).toBe(3);
    expect(data.cycleLength).toBe(31);
    expect(data.daysLeft).toBe(29); // 31 − 3 + 1
    expect(data.safePerDay).toBeCloseTo(2820 / 29);
    expect(data.projected).toBe(1860); // 60/day × 31
    expect(data.delta).toEqual({ delta: -20, direction: 'down', prevTotal: 200 });
  });

  it('lists the current cycle recent entries, newest first, capped at 5', async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.ready).toBe(true));
    const recent = result.current.data?.recent ?? [];
    expect(recent).toHaveLength(3); // only the 3 current-cycle rows, not the June one
    expect(recent[0].date).toBe('2026-07-20');
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(180);

    const db = await getBrowserDb();
    await addEntries(db, [{ date: '2026-07-21', account: 'Cash', category: 'Food', amount: -20 }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.total).toBe(200));
  });
});
