import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from './schema';
import { addEntries } from '@features/entries/queries';
import { setBudget } from './queries';
import { currentCycleKey, cycleFromKey } from '@features/entries/cycle';
import { todayIso } from '@shared/date';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useBudgetsPage } from './use-budgets-page';

// The hook has no ?cycle= param — it always reads the CURRENT cycle off the real clock. Rather than
// faking system time (which fights @testing-library's setTimeout-polling waitFor), derive the real
// current cycle's start date here and seed entries relative to it, so the test is correct on any day.
const cutoff = 18; // matches settings' DEFAULT_CUTOFF
const cycle = cycleFromKey(currentCycleKey(todayIso(), cutoff), cutoff);

describe('useBudgetsPage', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureBudgetsTable(db);
    await addEntries(db, [
      { date: cycle.start, account: 'Cash', category: 'Food', amount: -100 },
      { date: cycle.start, account: 'Cash', category: 'Food', amount: -50 },
      { date: cycle.start, account: 'Cash', category: 'Transport', amount: -20 },
    ]);
    await setBudget(db, 'Food', 200);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads budget rows for the current cycle', async () => {
    const { result } = renderHook(() => useBudgetsPage());
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.cycleLabel).toBe(cycle.label);
    expect(data.total.spent).toBe(170);
    const food = data.rows.find((r) => r.category === 'Food');
    expect(food?.limit).toBe(200);
    expect(food?.spent).toBe(150);
    expect(food?.state).toBe('under');
    // Food has a limit (active); Transport has spend but no limit (also active); nothing dormant here.
    expect(data.active.map((r) => r.category).sort()).toEqual(['Food', 'Transport']);
    expect(data.dormant).toEqual([]);
  });

  it('refetches when the data-version bumps after a budget write', async () => {
    const { result } = renderHook(() => useBudgetsPage());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total.limit).toBeNull();

    const db = await getBrowserDb();
    await setBudget(db, null, 500);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.total.limit).toBe(500));
  });

  it('excludes off-budget entries from a category row spend', async () => {
    const db = await getBrowserDb();
    // A per-entry off_budget:1 inside the already-budgeted Food category — a reimbursed one-off that
    // shouldn't count against the standing limit, per discretionaryByCategory's contract.
    await addEntries(db, [
      { date: cycle.start, account: 'Cash', category: 'Food', amount: -300, offBudget: 1 },
    ]);
    act(() => bumpDataVersion());

    const { result } = renderHook(() => useBudgetsPage());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const food = result.current.data?.rows.find((r) => r.category === 'Food');
    // 150 (100+50 from beforeEach) — the 300 off-budget entry is dropped, not folded in.
    expect(food?.spent).toBe(150);
  });
});
