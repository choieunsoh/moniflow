import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('./backup-safety', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./backup-safety')>()),
  isStoragePersisted: vi.fn(),
}));

import { isStoragePersisted } from './backup-safety';
import { useStoragePersisted } from './use-storage-persisted';

describe('useStoragePersisted', () => {
  beforeEach(() => vi.mocked(isStoragePersisted).mockReset());

  // null is "not known yet", NOT "not persisted" — a browser that has not answered must not be
  // reported to the user as unprotected, which is a scarier claim than the truth.
  it('starts unknown, then reports what the browser said', async () => {
    vi.mocked(isStoragePersisted).mockResolvedValue(true);
    const { result } = renderHook(() => useStoragePersisted());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reports a refused request as not persisted', async () => {
    vi.mocked(isStoragePersisted).mockResolvedValue(false);
    const { result } = renderHook(() => useStoragePersisted());
    await waitFor(() => expect(result.current).toBe(false));
  });

  // Unmounting mid-check must not publish. React logs a warning rather than throwing, so the real
  // assertion is that a late resolve cannot flip a torn-down hook's state.
  it('does not publish after unmount', async () => {
    let resolve: (v: boolean) => void = () => {};
    vi.mocked(isStoragePersisted).mockReturnValue(
      new Promise<boolean>((r) => {
        resolve = r;
      }),
    );
    const { result, unmount } = renderHook(() => useStoragePersisted());
    unmount();
    resolve(true);
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});
