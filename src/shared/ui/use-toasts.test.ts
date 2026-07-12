import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToasts } from './use-toasts';
import { toast, resetToasts } from './toast';

describe('useToasts', () => {
  beforeEach(() => {
    resetToasts();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-dismisses a toast after the timeout', () => {
    const { result } = renderHook(() => useToasts(5000));
    act(() => {
      toast('Saved');
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismiss removes a toast immediately', () => {
    const { result } = renderHook(() => useToasts(5000));
    let id = 0;
    act(() => {
      id = toast('Saved');
    });
    act(() => {
      result.current.dismiss(id);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('pause stops the auto-dismiss; resume reschedules it', () => {
    const { result } = renderHook(() => useToasts(5000));
    let id = 0;
    act(() => {
      id = toast('Saved');
    });
    act(() => {
      result.current.pause(id);
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.toasts).toHaveLength(1); // paused — still present
    act(() => {
      result.current.resume(id);
    });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('carries the action so Undo can be invoked', () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useToasts(5000));
    act(() => {
      toast.action('Merged into Cash', { label: 'Undo', onClick });
    });
    result.current.toasts[0].action?.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
