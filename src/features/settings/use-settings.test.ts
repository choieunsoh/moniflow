import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setCutoff, setIconSet, setFontScale } from './queries';
import { bumpDataVersion } from '@shared/data-version';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { useSettings } from './use-settings';

describe('useSettings', () => {
  beforeEach(async () => {
    const db = makeNodeProxyDb();
    await ensureSettingsTable(db);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('starts not ready, then loads the defaults from a fresh DB', async () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.ready).toBe(false);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.ready).toBe(true));
    const { data } = result.current;
    expect(data).not.toBeNull();
    if (data === null) throw new Error('unreachable — checked above');

    expect(data.cutoff).toBe(18);
    expect(data.iconSet).toBe('emoji');
    expect(data.cardFeePct).toBe(2.5);
    expect(data.fontScale).toBe('md');
    expect(data.keypadLayout).toBe('calc');
  });

  it('refetches when the data-version bumps after a write', async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const db = await getBrowserDb();
    await setCutoff(db, 25);
    await setIconSet(db, 'phosphor');
    await setFontScale(db, 'xl');
    act(() => bumpDataVersion());

    await waitFor(() => expect(result.current.data?.cutoff).toBe(25));
    expect(result.current.data?.iconSet).toBe('phosphor');
    expect(result.current.data?.fontScale).toBe('xl');
  });
});
