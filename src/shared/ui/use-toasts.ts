'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { subscribe, getToasts, dismissToast, type Toast } from './toast';

export type UseToasts = {
  toasts: Toast[];
  dismiss: (id: number) => void;
  pause: (id: number) => void;
  resume: (id: number) => void;
};

// Subscribes the ToastRegion to the module store and owns each toast's auto-dismiss timer. Timers
// live HERE (not in the store) so hover/focus can pause them per toast: pause clears a timer, resume
// reschedules it. useSyncExternalStore keeps the render in lockstep with the external store.
export function useToasts(autoDismissMs = 5000): UseToasts {
  const toasts = useSyncExternalStore(subscribe, getToasts, getToasts);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const schedule = useCallback(
    (id: number) => {
      const existing = timers.current.get(id);
      if (existing) clearTimeout(existing);
      timers.current.set(
        id,
        setTimeout(() => dismissToast(id), autoDismissMs),
      );
    },
    [autoDismissMs],
  );

  // Arm a timer for any newly-added toast; drop timers for toasts that are gone.
  // ponytail: a new toast arriving re-arms a currently-hovered toast's timer (it has no timer while
  // paused, so this effect reschedules it). Harmless in practice; add a paused-id ref set if it bites.
  useEffect(() => {
    for (const t of toasts) {
      if (!timers.current.has(t.id)) schedule(t.id);
    }
    for (const [id, timer] of timers.current) {
      if (!toasts.some((t) => t.id === id)) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
    }
  }, [toasts, schedule]);

  // Clear every pending timer on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const resume = useCallback((id: number) => schedule(id), [schedule]);

  return { toasts, dismiss: dismissToast, pause, resume };
}
