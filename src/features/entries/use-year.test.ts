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
describe('useYear', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await addEntries(db, [
      // cycle 2026-05 (18 May – 17 Jun) — Food 1000
      { date: '2026-05-20', account: 'Cash', category: 'Food', amount: -1000 },
      // cycle 2026-06 (18 Jun – 17 Jul) — Food 1400
      { date: '2026-06-20', account: 'Cash', category: 'Food', amount: -1400 },
      // Income is dropped by every read surface — it must not reach the recap.
      { date: '2026-07-21', account: 'Cash', category: 'Salary', amount: 50000 },
    ]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('folds the window into a year summary with category meta', async () => {
    const { result } = renderHook(() => useYear(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.bars).toHaveLength(12);
    expect(result.current.data?.total).toBe(2400);
    expect(result.current.data?.categories[0]).toEqual({ name: 'Food', value: 2400, count: 2 });
    expect(typeof result.current.data?.iconSet).toBe('string');
  });

  it('reports an empty ledger as no categories', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);

    const { result } = renderHook(() => useYear(null));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.categories).toEqual([]);
  });
});
