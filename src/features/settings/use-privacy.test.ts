import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setPrivacy } from './queries';
import { PRIVACY_STORAGE_KEY } from './theme';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { usePrivacy } from './use-privacy';

describe('usePrivacy', () => {
  beforeEach(async () => {
    delete document.documentElement.dataset.privacy;
    delete document.documentElement.dataset.peek;
    localStorage.clear();
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it("stamps data-privacy='on' and caches it when the setting is on", async () => {
    const db = await getBrowserDb();
    await setPrivacy(db, 'on');

    renderHook(() => usePrivacy());

    await waitFor(() => expect(document.documentElement.dataset.privacy).toBe('on'));
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe('on');
  });

  it('REMOVES the attribute for the default, rather than stamping off', async () => {
    renderHook(() => usePrivacy());

    await waitFor(() => expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe('off'));
    expect(document.documentElement.dataset.privacy).toBeUndefined();
  });

  it('re-runs on a data-version bump', async () => {
    const db = await getBrowserDb();
    renderHook(() => usePrivacy());
    await waitFor(() => expect(document.documentElement.dataset.privacy).toBeUndefined());

    await setPrivacy(db, 'on');
    act(() => bumpDataVersion());

    await waitFor(() => expect(document.documentElement.dataset.privacy).toBe('on'));
    expect(localStorage.getItem(PRIVACY_STORAGE_KEY)).toBe('on');
  });

  it('press-and-hold on any .money figure sets data-peek globally, and release clears it', () => {
    document.body.innerHTML = '<div id="chart" class="money"><span id="figure">฿100</span></div>';
    renderHook(() => usePrivacy());

    const figure = document.getElementById('figure');
    expect(figure).not.toBeNull();
    figure?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.documentElement.dataset.peek).toBe('');

    document.dispatchEvent(new Event('pointerup'));
    expect(document.documentElement.dataset.peek).toBeUndefined();
  });

  it('does nothing on a pointerdown outside any .money element', () => {
    document.body.innerHTML = '<div id="plain">not money</div>';
    renderHook(() => usePrivacy());

    document.getElementById('plain')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.documentElement.dataset.peek).toBeUndefined();
  });
});
