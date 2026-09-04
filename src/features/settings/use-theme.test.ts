import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setTheme, setAccent } from './queries';
import { THEME_STORAGE_KEY, ACCENT_STORAGE_KEY } from './theme';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useTheme } from './use-theme';

describe('useTheme', () => {
  beforeEach(async () => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.accent;
    localStorage.clear();
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('leaves both attributes off for the defaults, so :root stays the source of truth', async () => {
    renderHook(() => useTheme());
    await waitFor(() => expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.accent).toBeUndefined();
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('ink');
  });

  it('stamps an explicit choice on each axis', async () => {
    const db = await getBrowserDb();
    await setTheme(db, 'light');
    await setAccent(db, 'teal');

    renderHook(() => useTheme());

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(document.documentElement.dataset.accent).toBe('teal');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('teal');
  });

  it('re-applies on a data-version bump, and REMOVES an attribute when the default is chosen', async () => {
    const db = await getBrowserDb();
    await setAccent(db, 'rose');
    renderHook(() => useTheme());
    await waitFor(() => expect(document.documentElement.dataset.accent).toBe('rose'));

    await setAccent(db, 'ink');
    act(() => bumpDataVersion());

    await waitFor(() => expect(document.documentElement.dataset.accent).toBeUndefined());
    expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('ink');
  });

  it('reconciles a paint cache that has drifted from the db', async () => {
    localStorage.setItem(ACCENT_STORAGE_KEY, 'azure');
    renderHook(() => useTheme());
    await waitFor(() => expect(localStorage.getItem(ACCENT_STORAGE_KEY)).toBe('ink'));
    expect(document.documentElement.dataset.accent).toBeUndefined();
  });
});
