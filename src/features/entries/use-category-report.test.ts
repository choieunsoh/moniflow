import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// The window anchors on "today" — which cycle is live, which year is current — so the clock has to
// be pinned or every expectation below drifts with the calendar.
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-20'),
}));

import { getBrowserDb } from '@db/browser';
import { useCategoryReport } from './use-category-report';

// Cutoff 18 is settings' DEFAULT_CUTOFF, so every date below (all on the 19th–25th) sits in the
// cycle keyed to its own month. On the pinned clock the live cycle is 2026-07.
//
// Year windows are cycle-aligned: 2026 runs 18 Jan 2026 → 17 Aug 2026 here (it stops at the live
// cycle), which is why 2026-01-20 lands in 2026 and not in 2025.
let db: Db;

describe('useCategoryReport', () => {
  beforeEach(async () => {
    db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
    await addEntries(db, [
      { date: '2024-07-20', account: 'Cash', category: 'Food', amount: -1000 },
      { date: '2025-03-20', account: 'Cash', category: 'Food', amount: -600 },
      { date: '2026-01-20', account: 'Cash', category: 'Food', amount: -1000 },
      { date: '2026-02-20', account: 'Cash', category: 'Travel', amount: -500 },
      // The live cycle — partial.
      { date: '2026-07-19', account: 'Cash', category: 'Food', amount: -300 },
      // Income never reaches a read surface.
      { date: '2026-01-21', account: 'Cash', category: 'Salary', amount: 50000 },
    ]);
  });

  it('monthly defaults to the current year and labels bars by month', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.year).toBe(2026);
    // cyclesInYear clips at the live cycle, so 2026 is seven cycles, not twelve.
    expect(result.current.data?.bars.map((b) => b.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
    ]);
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([1000, 500, 0, 0, 0, 0, 300]);
    expect(result.current.data?.bars.map((b) => b.partial)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(result.current.data?.total).toBe(1800);
  });

  it('monthly ranks the year’s categories for the picker list', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', 2026, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.categories).toEqual([
      { name: 'Food', value: 1300, count: 2 },
      { name: 'Travel', value: 500, count: 1 },
    ]);
  });

  it('monthly filtered decomposes the year, keeping empty months', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', 2026, 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(1300);
    expect(result.current.data?.rows.map((r) => [r.label, r.value, r.count])).toEqual([
      ['Jan', 1000, 1],
      ['Feb', 0, 0],
      ['Mar', 0, 0],
      ['Apr', 0, 0],
      ['May', 0, 0],
      ['Jun', 0, 0],
      ['Jul', 300, 1],
    ]);
  });

  it('clamps a ?year= outside the ledger’s span', async () => {
    const early = renderHook(() => useCategoryReport('monthly', 1999, null));
    await waitFor(() => expect(early.result.current.ready).toBe(true));
    expect(early.result.current.data?.year).toBe(2024);

    const late = renderHook(() => useCategoryReport('monthly', 2099, null));
    await waitFor(() => expect(late.result.current.ready).toBe(true));
    expect(late.result.current.data?.year).toBe(2026);
  });

  it('yearly spans every tracked year, one bar each, current year partial', async () => {
    const { result } = renderHook(() => useCategoryReport('yearly', null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars.map((b) => b.label)).toEqual(['2024', '2025', '2026']);
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([1000, 600, 1800]);
    expect(result.current.data?.bars.map((b) => b.partial)).toEqual([false, false, true]);
    expect(result.current.data?.total).toBe(3400);
  });

  it('yearly filtered reads one category down the years', async () => {
    const { result } = renderHook(() => useCategoryReport('yearly', null, 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.rows.map((r) => [r.label, r.value])).toEqual([
      ['2024', 1000],
      ['2025', 600],
      ['2026', 1300],
    ]);
  });

  it('reports an empty ledger as firstYear null', async () => {
    const empty = makeNodeProxyDb();
    await ensureEntriesTable(empty);
    await ensureSettingsTable(empty);
    vi.mocked(getBrowserDb).mockResolvedValue(empty);
    const { result } = renderHook(() => useCategoryReport('monthly', null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.firstYear).toBeNull();
    expect(result.current.data?.categories).toEqual([]);
  });

  it('refetches after a write', async () => {
    const { result } = renderHook(() => useCategoryReport('monthly', 2026, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.total).toBe(1800);

    await addEntries(db, [{ date: '2026-04-20', account: 'Cash', category: 'Food', amount: -700 }]);
    act(() => bumpDataVersion());
    await waitFor(() => expect(result.current.data?.total).toBe(2500));
  });
});
