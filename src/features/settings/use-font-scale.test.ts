import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setFontScale, FONT_SCALE_STORAGE_KEY } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useFontScale } from './use-font-scale';

describe('useFontScale', () => {
  beforeEach(async () => {
    document.documentElement.style.fontSize = '';
    localStorage.clear();
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('applies the default (md -> 100%) from a fresh DB and caches it', async () => {
    renderHook(() => useFontScale());
    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('100%'));
    expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('md');
  });

  it('re-applies and re-caches when the data-version bumps after a write', async () => {
    renderHook(() => useFontScale());
    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('100%'));

    const db = await getBrowserDb();
    await setFontScale(db, 'lg');
    act(() => bumpDataVersion());

    await waitFor(() => expect(document.documentElement.style.fontSize).toBe('112.5%'));
    expect(localStorage.getItem(FONT_SCALE_STORAGE_KEY)).toBe('lg');
  });
});
