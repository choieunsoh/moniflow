import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResolvedTheme } from './use-resolved-theme';

// jsdom has no real matchMedia. This stub is a tiny event emitter so a test can flip the OS
// preference the way a phone does at sunset, which is the case the hook exists for.
function stubMatchMedia(initialDark: boolean) {
  const listeners = new Set<() => void>();
  let matches = initialDark;
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return (next: boolean) => {
    matches = next;
    for (const fn of listeners) fn();
  };
}

describe('useResolvedTheme', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('follows the OS when no theme is forced', () => {
    stubMatchMedia(true);
    expect(renderHook(() => useResolvedTheme()).result.current).toBe('dark');

    stubMatchMedia(false);
    expect(renderHook(() => useResolvedTheme()).result.current).toBe('light');
  });

  it('lets an explicit data-theme override the OS in both directions', () => {
    stubMatchMedia(true);
    document.documentElement.dataset.theme = 'light';
    expect(renderHook(() => useResolvedTheme()).result.current).toBe('light');

    stubMatchMedia(false);
    document.documentElement.dataset.theme = 'dark';
    expect(renderHook(() => useResolvedTheme()).result.current).toBe('dark');
  });

  // The case this hook exists for. An OS switch under 'system' repaints every CSS colour live and
  // deliberately bumps nothing — so a canvas chart that baked token values never heard about it.
  it('re-renders when the OS flips while the app is open', () => {
    const setDark = stubMatchMedia(false);
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('light');

    act(() => setDark(true));
    expect(result.current).toBe('dark');
  });

  it('re-renders when data-theme is stamped on <html> outside React', async () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useResolvedTheme());
    expect(result.current).toBe('dark');

    // The picker and the pre-paint script both write this attribute directly, never through React.
    await act(async () => {
      document.documentElement.dataset.theme = 'light';
      await Promise.resolve();
    });
    expect(result.current).toBe('light');
  });
});
