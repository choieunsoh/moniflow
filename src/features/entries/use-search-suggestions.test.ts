import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { addCategory } from '@features/categories/queries';
import { addAccount } from '@features/accounts/queries';
import { setIconSet } from '@features/settings/queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useSearchSuggestions } from './use-search-suggestions';

describe('useSearchSuggestions', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureSettingsTable(db);
    // 'Cash' named on both sides — proves the union is de-duped, not just concatenated.
    await addCategory(db, 'Food');
    await addCategory(db, 'Transport');
    await addCategory(db, 'Cash');
    await addAccount(db, 'Cash');
    await addAccount(db, 'Bank');
    await setIconSet(db, 'phosphor');
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads the sorted de-duped pool + icon set', async () => {
    const { result } = renderHook(() => useSearchSuggestions());
    expect(result.current.ready).toBe(false);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.iconSet).toBe('emoji');

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.suggestions).toEqual(['Bank', 'Cash', 'Food', 'Transport']);
    expect(result.current.iconSet).toBe('phosphor');
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useSearchSuggestions());
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.suggestions).toEqual(['Bank', 'Cash', 'Food', 'Transport']);

    const db = await getBrowserDb();
    await addCategory(db, 'Rent');
    act(() => bumpDataVersion());

    await waitFor(() =>
      expect(result.current.suggestions).toEqual(['Bank', 'Cash', 'Food', 'Rent', 'Transport']),
    );
  });
});
