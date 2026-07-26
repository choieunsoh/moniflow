import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// The window anchors on "today" (which month is current, which cycle is still running), so the
// clock has to be pinned or every expectation below drifts with the calendar.
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-20'),
}));

import { getBrowserDb } from '@db/browser';
import { useMonth } from './use-month';

async function emptyDb() {
  const db = makeNodeProxyDb();
  await ensureEntriesTable(db);
  await ensureSettingsTable(db);
  vi.mocked(getBrowserDb).mockResolvedValue(db);
  return db;
}

// Cutoff 18 is settings' DEFAULT_CUTOFF, so every date below sits in the cycle keyed to its own
// month (all are on the 19th–25th).
describe('useMonth', () => {
  beforeEach(async () => {
    const db = await emptyDb();
    await addEntries(db, [
      // Julys — 2026 is the LIVE cycle on the pinned clock, so it is partial.
      { date: '2024-07-20', account: 'Cash', category: 'Food', amount: -1000 },
      { date: '2025-07-20', account: 'Cash', category: 'Food', amount: -1500 },
      { date: '2025-07-25', account: 'Cash', category: 'Travel', amount: -500 },
      { date: '2026-07-19', account: 'Cash', category: 'Food', amount: -300 },
      // Marches — all complete, so this month has a real delta.
      { date: '2024-03-20', account: 'Cash', category: 'Food', amount: -400 },
      { date: '2025-03-20', account: 'Cash', category: 'Food', amount: -600 },
      { date: '2026-03-20', account: 'Cash', category: 'Food', amount: -900 },
      // Income never reaches a read surface.
      { date: '2025-07-21', account: 'Cash', category: 'Salary', amount: 50000 },
    ]);
  });

  it('shows the month across every tracked year, labelled by year', async () => {
    const { result } = renderHook(() => useMonth(7, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars.map((b) => b.label)).toEqual(['2024', '2025', '2026']);
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([1000, 2000, 300]);
    expect(result.current.data?.monthName).toBe('July');
  });

  it('defaults to the current cycle’s month', async () => {
    const { result } = renderHook(() => useMonth(null, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.month).toBe(7);
  });

  it('withholds the delta while the newest occurrence is still running', async () => {
    const { result } = renderHook(() => useMonth(7, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // July 2026 is 2 days old against a whole July 2025 — any delta here is guaranteed wrong.
    expect(result.current.data?.latest?.partial).toBe(true);
    expect(result.current.data?.delta).toBeNull();
  });

  it('compares the two most recent occurrences once the newest is complete', async () => {
    const { result } = renderHook(() => useMonth(3, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.latest?.value).toBe(900);
    expect(result.current.data?.delta).toEqual({ amount: 300, pct: 0.5, againstLabel: '2025' });
  });

  it('ranks the newest occurrence’s categories, not the whole window’s', async () => {
    const { result } = renderHook(() => useMonth(3, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // 2026's March alone — 900, not the 1,900 every March sums to.
    expect(result.current.data?.categories).toEqual([{ name: 'Food', value: 900, count: 1 }]);
  });

  it('reads one column when scoped to a category', async () => {
    const { result } = renderHook(() => useMonth(7, 'Travel'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars.map((b) => b.value)).toEqual([0, 500, 0]);
    // Every year kept, including the zeros: "you did not travel in July 2024" IS the answer, and
    // dropping the row would leave a list shorter than the chart beside it.
    expect(result.current.data?.cycleRows).toEqual([
      { key: '2024-07', label: '2024', value: 0, count: 0 },
      { key: '2025-07', label: '2025', value: 500, count: 1 },
      { key: '2026-07', label: '2026', value: 0, count: 0 },
    ]);
    expect(result.current.data?.categories).toEqual([]);
  });

  it('drops a month that has not come round yet this year', async () => {
    const { result } = renderHook(() => useMonth(12, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // December 2026 has not started, so the window ends at 2025.
    expect(result.current.data?.bars.map((b) => b.label)).toEqual(['2024', '2025']);
  });

  it('reports an empty ledger with no window at all', async () => {
    await emptyDb();

    const { result } = renderHook(() => useMonth(7, null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.firstYear).toBeNull();
    expect(result.current.data?.bars).toEqual([]);
    expect(result.current.data?.latest).toBeNull();
  });
});
