import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';
import { setBudget } from '@features/budgets/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useAnalytics } from './use-analytics';

// The window is anchored to the cycle key the caller passes, so — unlike useBudgetsPage's test —
// these never depend on the real clock and can use fixed dates. Cutoff 18 is settings' DEFAULT_CUTOFF
// (getCutoff returns it when the settings table has no row), so the cycle boundaries below are real.
//
// ensureEntriesTable bootstraps the categories + accounts FK tables too, so it is the only ledger
// ensure call needed here.
describe('useAnalytics', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureBudgetsTable(db);
    await ensureSettingsTable(db);
    await addEntries(db, [
      // cycle 2026-05 (18 May – 17 Jun) — Food 900
      { date: '2026-05-20', account: 'Cash', category: 'Food', amount: -900 },
      // cycle 2026-06 (18 Jun – 17 Jul) — Food 1200, Travel 300
      { date: '2026-06-20', account: 'Cash', category: 'Food', amount: -1200 },
      { date: '2026-07-01', account: 'Cash', category: 'Travel', amount: -300 },
      // cycle 2026-07 (18 Jul – 17 Aug) — Food 400
      { date: '2026-07-20', account: 'Cash', category: 'Food', amount: -400 },
      // Income is dropped by every read surface — it must not reach the trend.
      { date: '2026-07-21', account: 'Cash', category: 'Salary', amount: 50000 },
    ]);
    await setBudget(db, 'Food', 1000);
    await setBudget(db, null, 20000); // the whole-cycle TOTAL budget (category_id IS NULL)
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready', () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('totals spend per cycle across the window, newest last', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const bars = result.current.data?.bars ?? [];
    expect(bars.map((b) => b.key)).toEqual([
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
    // 2026-06 is Food 1200 + Travel 300; income never lands.
    expect(bars.map((b) => b.value)).toEqual([0, 0, 0, 900, 1500, 400]);
  });

  it('filters the same bars to one category when a filter is active', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([0, 0, 0, 900, 1200, 400]);
  });

  it('aggregates the window into a category list, biggest first', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const slices = result.current.data?.slices ?? [];
    expect(slices.map((s) => s.name)).toEqual(['Food', 'Travel']);
    expect(slices.map((s) => s.value)).toEqual([2500, 300]);
  });

  it('reports the window total', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(2800);
  });

  it('falls back to the current cycle when no key is given', async () => {
    const { result } = renderHook(() => useAnalytics(null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.activeKey).toBe(result.current.data?.currentKey);
    expect(result.current.data?.bars).toHaveLength(6);
  });

  it('uses the total budget as the budget line when unfiltered', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.budgetLine).toBe(20000);
  });

  it('uses the category budget as the budget line when filtered', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.budgetLine).toBe(1000);
  });

  it('has no budget line for a filtered category with no budget of its own', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', 'Travel'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.budgetLine).toBeNull();
  });
});
