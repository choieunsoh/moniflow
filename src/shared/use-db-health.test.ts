import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { makeNodeProxyDb } from '@db/client';
import { useDbHealth } from './use-db-health';

// A real (in-memory) Db rather than a bare object: the hook only cares whether the promise settles,
// but the mock still has to satisfy getBrowserDb's return type.
const okDb = makeNodeProxyDb();

// The failure this reports is real and reachable: OPFS grants its exclusive access handle to one
// tab, so opening moniflow in a second tab on the same origin fails to boot the db. Before this,
// that tab simply sat on its loading skeleton forever with nothing to read and nothing to press.
describe('useDbHealth', () => {
  beforeEach(() => {
    vi.mocked(getBrowserDb).mockReset();
  });

  it('stays quiet when the db opens', async () => {
    vi.mocked(getBrowserDb).mockResolvedValue(okDb);
    const { result } = renderHook(() => useDbHealth());

    await waitFor(() => expect(result.current.checked).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it('reports a failure so the shell can explain it', async () => {
    vi.mocked(getBrowserDb).mockRejectedValue(new Error('NoModificationAllowedError'));
    const { result } = renderHook(() => useDbHealth());

    await waitFor(() => expect(result.current.failed).toBe(true));
  });

  it('recovers on retry once the other tab lets go', async () => {
    vi.mocked(getBrowserDb).mockRejectedValueOnce(new Error('NoModificationAllowedError'));
    const { result } = renderHook(() => useDbHealth());
    await waitFor(() => expect(result.current.failed).toBe(true));

    // The tab holding the lock closes; the next attempt succeeds. This only works because
    // getBrowserDb evicts its cache on failure — a memoised rejection would return the same dead
    // promise forever and no amount of pressing Retry would help.
    vi.mocked(getBrowserDb).mockResolvedValue(okDb);
    act(() => {
      result.current.retry();
    });

    await waitFor(() => expect(result.current.failed).toBe(false));
    expect(vi.mocked(getBrowserDb).mock.calls.length).toBeGreaterThan(1);
  });

  it('ignores a result that lands after unmount', async () => {
    let settle = (): void => {};
    vi.mocked(getBrowserDb).mockReturnValue(
      new Promise((_, rej) => {
        settle = () => rej(new Error('too late'));
      }),
    );
    const { unmount } = renderHook(() => useDbHealth());
    unmount();

    // Must not warn about setting state on an unmounted hook, and must not throw.
    await act(async () => {
      settle();
      await Promise.resolve();
    });
  });
});
