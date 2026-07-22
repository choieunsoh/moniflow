import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { writeConnection } from './connection';
import { bumpDataVersion } from '@shared/data-version';
import { useDriveStatus } from './use-drive-status';

describe('useDriveStatus', () => {
  beforeEach(() => localStorage.clear());

  it('reflects the stored connection and recomputes on data-version bump', async () => {
    const { result } = renderHook(() => useDriveStatus());
    await waitFor(() => expect(result.current.connected).toBe(false));

    act(() => {
      writeConnection({ connected: true, folderId: 'f', lastSyncedAt: 42, needsReconnect: true });
      bumpDataVersion();
    });
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.lastSyncedAt).toBe(42);
    expect(result.current.needsReconnect).toBe(true);
  });
});
