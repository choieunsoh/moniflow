'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useToasts } from './use-toasts';
import type { Toast } from './toast';

// No-op subscribe: this store never changes after mount, it just gives us a snapshot that differs
// between server (false) and client (true) — the sanctioned useSyncExternalStore idiom for "has this
// hydrated on the client yet", without the setState-in-effect cascading-render lint violation.
const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

// One region mounted in layout.tsx. Two stable aria-live containers (polite for normal, assertive
// for errors) so screen readers announce new toasts without the whole list being re-read. Timers +
// pause/resume come from useToasts; hover/focus pauses the hovered toast's auto-dismiss.
export function ToastRegion() {
  const { toasts, dismiss, pause, resume } = useToasts();
  // Portal target (document.body) only exists client-side; render nothing until mounted.
  const mounted = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
  if (!mounted) return null;

  const polite = toasts.filter((t) => t.tone === 'polite');
  const assertive = toasts.filter((t) => t.tone === 'assertive');

  return createPortal(
    <>
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {polite.map((t) => (
          <ToastItem key={t.id} toast={t} dismiss={dismiss} pause={pause} resume={resume} />
        ))}
      </div>
      {/* ponytail: assertive region overlaps the polite one; only matters if an error + a normal
          toast are visible at once (rare). Give it a different offset if that ever looks wrong. */}
      <div className="toast-region" aria-live="assertive" aria-atomic="false">
        {assertive.map((t) => (
          <ToastItem key={t.id} toast={t} dismiss={dismiss} pause={pause} resume={resume} />
        ))}
      </div>
    </>,
    document.body,
  );
}

function ToastItem({
  toast,
  dismiss,
  pause,
  resume,
}: {
  toast: Toast;
  dismiss: (id: number) => void;
  pause: (id: number) => void;
  resume: (id: number) => void;
}) {
  const { id, message, action } = toast;
  return (
    <div
      className="toast"
      role="status"
      onMouseEnter={() => pause(id)}
      onMouseLeave={() => resume(id)}
      onFocus={() => pause(id)}
      onBlur={() => resume(id)}
    >
      <span className="flex-1">{message}</span>
      {action && (
        <button
          type="button"
          className="tap shrink-0 px-2 text-sm font-semibold"
          style={{ color: 'var(--color-accent-text)' }}
          onClick={() => {
            action.onClick();
            dismiss(id);
          }}
        >
          {action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="tap shrink-0 px-2"
        style={{ color: 'var(--color-faint)' }}
        onClick={() => dismiss(id)}
      >
        ×
      </button>
    </div>
  );
}
