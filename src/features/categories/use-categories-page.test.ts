import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addEntries } from '@features/entries/queries';
import { setCategoryEmoji, setCategoryOffBudget } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useCategoriesPage } from './use-categories-page';

describe('useCategoriesPage', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    await addEntries(db, [
      { date: '2026-07-01', account: 'Cash', category: 'Food', amount: -100 },
      { date: '2026-07-02', account: 'Cash', category: 'Food', amount: -50 },
      { date: '2026-07-03', account: 'Cash', category: 'Transport', amount: -20 },
    ]);
    await setCategoryEmoji(db, 'Food', '🍔');
    await setCategoryOffBudget(db, 'Transport', true);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads category counts + emoji map from the seeded ledger', async () => {
    const { result } = renderHook(() => useCategoriesPage());
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.counts.map((c) => c.category).sort()).toEqual(['Food', 'Transport']);
    const food = data.counts.find((c) => c.category === 'Food');
    expect(food?.count).toBe(2);
    expect(data.emojiMap.Food).toBe('🍔');
    expect(data.offBudgetSet.has('Transport')).toBe(true);
    expect(data.offBudgetSet.has('Food')).toBe(false);
    expect(data.keypadCategories.map((c) => c.name).sort()).toEqual(['Food', 'Transport']);
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useCategoriesPage());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.data?.counts.length).toBe(2);

    const db = await getBrowserDb();
    await addEntries(db, [{ date: '2026-07-04', account: 'Cash', category: 'Bills', amount: -30 }]);
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.counts.length).toBe(3));
  });
});
