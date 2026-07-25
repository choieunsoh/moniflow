import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { addEntries } from './queries';
import { setBudget } from '@features/budgets/queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// delta anchors on "today", so the clock has to be pinned or its meaning drifts with the calendar.
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-20'),
}));

import { getBrowserDb } from '@db/browser';
import { todayIso } from '@shared/date';
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
    await ensureSettingsTable(db);
    await ensureBudgetsTable(db);
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
    await setBudget(db, null, 20000); // the whole-cycle TOTAL budget (category_id IS NULL)
    await setBudget(db, 'Food', 1000); // a per-category limit; Travel has none
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
    const categories = result.current.data?.categories ?? [];
    expect(categories.map((c) => c.name)).toEqual(['Food', 'Travel']);
    expect(categories.map((c) => c.value)).toEqual([2500, 300]);
  });

  it('shows every category with no "Other" rollup, even past the palette size', async () => {
    // toDonutSlices caps at 7 (one per palette colour) and folds the tail into "Other" so the donut
    // ring stays readable. The analytics list has no ring to key to, so it must show them all — eight
    // categories here proves the cap is gone and no synthetic "Other" bucket is created.
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await ensureBudgetsTable(db);
    await addEntries(
      db,
      Array.from({ length: 8 }, (_, i) => ({
        date: '2026-07-20',
        account: 'Cash',
        category: `Cat${i}`,
        amount: -(100 + i * 10),
      })),
    );
    vi.mocked(getBrowserDb).mockResolvedValue(db);

    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const categories = result.current.data?.categories ?? [];
    expect(categories).toHaveLength(8);
    expect(categories.some((c) => c.name === 'Other')).toBe(false);
    // biggest first: Cat7 (170) down to Cat0 (100).
    expect(categories[0].name).toBe('Cat7');
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

  it('has no per-cycle rows when unfiltered — the list is the category breakdown then', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.cycleRows).toEqual([]);
  });

  it('breaks the filtered category down per cycle, oldest first, skipping cycles with no spend', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const rows = result.current.data?.cycleRows ?? [];
    expect(rows.map((r) => r.key)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(rows.map((r) => r.label)).toEqual(['May', 'Jun', 'Jul']);
    expect(rows.map((r) => r.value)).toEqual([900, 1200, 400]);
    expect(rows.map((r) => r.count)).toEqual([1, 1, 1]);
  });

  it('uses the total budget as the budget line when unfiltered', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.budgetLine).toBe(20000);
  });

  it('uses the category budget as the budget line when filtered to that category', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.budgetLine).toBe(1000);
  });

  it('has no budget line for a filtered category with no budget of its own', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', 'Travel'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.budgetLine).toBeNull();
  });

  it('the header total sums the list beneath it', async () => {
    // The P0 regression guard. `total` was category-filtered while the list was not, so a filtered
    // page showed Food's total over a list of every category. Nothing asserted that the two agree,
    // which is the only reason it shipped.
    const { result } = renderHook(() => useAnalytics('2026-07', 'Food'));
    await waitFor(() => expect(result.current.ready).toBe(true));
    const rows = result.current.data?.cycleRows ?? [];
    const summed = rows.reduce((sum, r) => sum + r.value, 0);
    expect(summed).toBe(result.current.data?.total);
  });

  it('exposes anchor-cycle heatmap cells and top-notes', async () => {
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // 18 Jul – 17 Aug inclusive = 31 day-cells.
    expect(result.current.data?.heatmapCells).toHaveLength(31);
    // one entry in the anchor cycle, no note → the "No note" bucket at 400.
    expect(result.current.data?.topNotes).toEqual([{ note: 'No note', total: 400, count: 1 }]);
  });

  it('surfaces a category spending above its own norm as an anomaly', async () => {
    // Push anchor-cycle Food to 2100 (400 + 1700); prior Food avg is (900 + 1200) / 2 = 1050,
    // so ratio = 2.0 ≥ 1.5 threshold.
    const db = await getBrowserDb();
    await addEntries(db, [
      { date: '2026-07-21', account: 'Cash', category: 'Food', amount: -1700 },
    ]);
    const { result } = renderHook(() => useAnalytics('2026-07', null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.anomalies).toEqual([
      { category: 'Food', current: 2100, avg: 1050, ratio: 2 },
    ]);
  });

  describe('by=account', () => {
    it('aggregates the window by account when by="account" and unfiltered', async () => {
      const db = makeNodeProxyDb();
      await ensureEntriesTable(db);
      await ensureSettingsTable(db);
      await ensureBudgetsTable(db);
      await addEntries(db, [
        { date: '2026-07-20', account: 'Cash', category: 'Food', amount: -100 },
        { date: '2026-07-20', account: 'Cash', category: 'Travel', amount: -50 },
        { date: '2026-07-20', account: 'Card', category: 'Food', amount: -200 },
      ]);
      vi.mocked(getBrowserDb).mockResolvedValue(db);

      const { result } = renderHook(() => useAnalytics(null, null, 'account'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      const rows = result.current.data?.categories ?? [];
      // Ranked by magnitude: Card 200 then Cash 150.
      expect(rows.map((r) => r.name)).toEqual(['Card', 'Cash']);
      expect(result.current.data?.by).toBe('account');
    });

    it('defaults to category grouping', async () => {
      const { result } = renderHook(() => useAnalytics(null, null));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.data?.by).toBe('category');
    });

    it('keeps anomalies category-named even when the list is account-grouped', async () => {
      // Same spike as "surfaces a category spending above its own norm": push anchor-cycle Food to
      // 2100 (400 + 1700); prior Food avg is (900 + 1200) / 2 = 1050, ratio = 2.0 ≥ 1.5 threshold.
      // The matrix feeding anomalies() must stay category-keyed regardless of `by`, so by='account'
      // must report the exact same (category-named) anomalies as the default category grouping.
      const db = await getBrowserDb();
      await addEntries(db, [
        { date: '2026-07-21', account: 'Cash', category: 'Food', amount: -1700 },
      ]);

      const byCategory = renderHook(() => useAnalytics('2026-07', null));
      await waitFor(() => expect(byCategory.result.current.ready).toBe(true));
      const byAccount = renderHook(() => useAnalytics('2026-07', null, 'account'));
      await waitFor(() => expect(byAccount.result.current.ready).toBe(true));

      const expected = [{ category: 'Food', current: 2100, avg: 1050, ratio: 2 }];
      expect(byCategory.result.current.data?.anomalies).toEqual(expected);
      expect(byAccount.result.current.data?.anomalies).toEqual(expected);
    });
  });

  describe('delta (this cycle vs last, moved from the dashboard)', () => {
    it('reports the unfiltered anchor cycle against the previous one', async () => {
      // '2026-07-01' falls in cycle '2026-06' (Jun18–Jul17, cutoff 18) — the seeded 1500 (Food 1200 +
      // Travel 300). The cycle before it, '2026-05', is seeded at 900.
      vi.mocked(todayIso).mockReturnValue('2026-07-01');
      const { result } = renderHook(() => useAnalytics(null, null));
      await waitFor(() => expect(result.current.ready).toBe(true));

      expect(result.current.data?.currentKey).toBe('2026-06');
      expect(result.current.data?.delta).toEqual({ delta: 600, direction: 'up', prevTotal: 900 });
    });

    it('reports the filtered category own anchor-vs-previous delta, not the whole cycle', async () => {
      // Same window as the unfiltered case above, but bars now hold Food's own per-cycle spend:
      // 2026-05 Food 900 → 2026-06 Food 1200 (the unfiltered delta was 900 → 1500, the whole cycle).
      vi.mocked(todayIso).mockReturnValue('2026-07-01');
      const { result } = renderHook(() => useAnalytics(null, 'Food'));
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.data?.delta).toEqual({ delta: 300, direction: 'up', prevTotal: 900 });
      expect(result.current.data?.deltaBreakdown).toEqual([]); // still unfiltered-only
    });
  });
});
