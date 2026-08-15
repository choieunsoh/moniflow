import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from './queries';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
// the window anchors on "today", so the clock has to be pinned or its meaning drifts with the
// calendar — mirrors use-analytics.test.ts's mock verbatim.
vi.mock('@shared/date', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/date')>()),
  todayIso: vi.fn(() => '2026-07-20'),
}));

import { getBrowserDb } from '@db/browser';
import { useYear } from './use-year';

// Cutoff 18 is settings' DEFAULT_CUTOFF (getCutoff returns it when the settings table has no row),
// so the cycle boundaries below are real. ensureEntriesTable bootstraps the categories + accounts FK
// tables too, so it is the only ledger ensure call needed here.
async function emptyDb() {
  const db = makeNodeProxyDb();
  await ensureEntriesTable(db);
  await ensureSettingsTable(db);
  vi.mocked(getBrowserDb).mockResolvedValue(db);
  return db;
}

describe('useYear', () => {
  beforeEach(async () => {
    const db = await emptyDb();
    await addEntries(db, [
      // cycle 2026-05 (18 May – 17 Jun) — Food 1000
      { date: '2026-05-20', account: 'Cash', category: 'Food', amount: -1000 },
      // cycle 2026-06 (18 Jun – 17 Jul) — Food 1400
      { date: '2026-06-20', account: 'Cash', category: 'Food', amount: -1400 },
      // A real refund against an EXISTING category (dinner on a card, a friend hands back cash) —
      // the actual shape this branch ships, not the unsupported "Salary" income row this fixture
      // used to carry. Same category as the two Food rows above, so it nets straight into Food.
      { date: '2026-07-21', account: 'Cash', category: 'Food', amount: 300 },
    ]);
  });

  it('folds the year to date into a summary with category meta', async () => {
    const { result } = renderHook(() => useYear(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // Jan–Jul, not twelve: the rest of 2026 has not happened, and empty bars would read as
    // five months of spending nothing.
    expect(result.current.data?.bars).toHaveLength(7);
    expect(result.current.data?.year).toBe(2026);
    expect(result.current.data?.total).toBe(2100); // 1000 + 1400 - 300, the ฿300 Food refund netted in
    expect(result.current.data?.categories[0]).toEqual({ name: 'Food', value: 2100, count: 3 });
    expect(typeof result.current.data?.iconSet).toBe('string');
  });

  it('labels the window from the cutoff to today, never past it', async () => {
    const { result } = renderHook(() => useYear(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // The live cycle ends 17 Aug — a label reaching that far claims spend that cannot exist yet.
    expect(result.current.data?.rangeLabel).toBe('18 Jan – 20 Jul 2026');
  });

  it('bounds the stepper by the oldest expense and the live cycle', async () => {
    const { result } = renderHook(() => useYear(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.firstYear).toBe(2026);
    expect(result.current.data?.currentYear).toBe(2026);
  });

  it('clamps a year outside the ledger back into range', async () => {
    const { result } = renderHook(() => useYear(2099));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.year).toBe(2026);
  });

  it('shows a completed past year in full', async () => {
    const db = await emptyDb();
    await addEntries(db, [
      { date: '2025-03-04', account: 'Cash', category: 'Food', amount: -700 },
      { date: '2026-05-20', account: 'Cash', category: 'Food', amount: -1000 },
    ]);

    const { result } = renderHook(() => useYear(2025));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars).toHaveLength(12);
    expect(result.current.data?.total).toBe(700);
    expect(result.current.data?.rangeLabel).toBe('18 Jan 2025 – 17 Jan 2026');
  });

  it('reaches back to the cycle year owning the oldest expense, not its date year', async () => {
    const db = await emptyDb();
    // 5 Jan 2025 falls in cycle 2024-12 (18 Dec – 17 Jan), so 2024 must stay reachable.
    await addEntries(db, [{ date: '2025-01-05', account: 'Cash', category: 'Food', amount: -300 }]);

    const { result } = renderHook(() => useYear(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.firstYear).toBe(2024);
  });

  it('reports an empty ledger as no categories', async () => {
    await emptyDb();

    const { result } = renderHook(() => useYear(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.categories).toEqual([]);
    expect(result.current.data?.firstYear).toBeNull();
  });
});
