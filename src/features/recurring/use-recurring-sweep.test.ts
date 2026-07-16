import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const runSweep = vi.fn();
const bumpDataVersion = vi.fn();

vi.mock('./sweep', () => ({ runSweep }));
vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn(() => Promise.resolve({})) }));
vi.mock('@shared/data-version', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/data-version')>()),
  bumpDataVersion,
}));

beforeEach(() => {
  vi.resetModules();
  runSweep.mockReset();
  bumpDataVersion.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRecurringSweep', () => {
  it('sweeps once and bumps the data version when it posted something', async () => {
    runSweep.mockResolvedValue(2);
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    renderHook(() => useRecurringSweep());
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(bumpDataVersion).toHaveBeenCalledTimes(1));
  });

  it('does not bump when nothing was due — no pointless refetch', async () => {
    runSweep.mockResolvedValue(0);
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    renderHook(() => useRecurringSweep());
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
    expect(bumpDataVersion).not.toHaveBeenCalled();
  });

  it('is memoized: a second mount awaits the same sweep rather than re-running it', async () => {
    runSweep.mockResolvedValue(1);
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    renderHook(() => useRecurringSweep());
    renderHook(() => useRecurringSweep());
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
  });

  it('swallows a sweep failure — a broken sweep must never white-screen the shell', async () => {
    runSweep.mockRejectedValue(new Error('db gone'));
    const { useRecurringSweep } = await import('./use-recurring-sweep');
    expect(() => renderHook(() => useRecurringSweep())).not.toThrow();
    await waitFor(() => expect(runSweep).toHaveBeenCalledTimes(1));
  });
});
