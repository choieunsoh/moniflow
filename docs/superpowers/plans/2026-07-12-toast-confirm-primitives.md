# Toast + ConfirmDialog Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two hand-rolled, zero-dependency UI primitives — a `toast()` notification system (with Undo) and a native-`<dialog>` `ConfirmDialog` — and wire the first real confirm caller: a "Wipe all data" action in settings.

**Architecture:** `toast()` is a module-level singleton store (`toast.ts`) that any code calls without a context; a single `<ToastRegion>` mounted in `layout.tsx` subscribes via the `useToasts` hook, which owns per-toast auto-dismiss timers (pausable on hover/focus). `ConfirmDialog` reuses the exact `showModal()`/`::backdrop`/Esc/backdrop-click pattern already in `MoreSheet`. "Wipe all data" is a client button → `ConfirmDialog` → server action that clears `entries`/`categories`/`budgets` in one transaction, then `toast('All data cleared')`.

**Tech Stack:** Next.js 16 App Router · React 19 (`useSyncExternalStore`, `createPortal`) · TypeScript 5.9 strict · Tailwind v4 tokens in `globals.css` · better-sqlite3 + drizzle-orm · Vitest + React Testing Library (jsdom).

**Conventions (enforced):** No `any`/`as`/`!`/ts-comments; `type` over `interface`; `for..of`; extensionless relative imports; `@db`/`@features`/`@shared` aliases. Gates run separately: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`. Commits: `type(scope): subject` with scope `shared` or `features`; every commit body ends with the two required trailers (shown in each commit step).

**Sequencing note:** This is concern #2 of 3 and is built **before** concern #1 (Accounts). At this point there is **no `accounts` table**, so the wipe clears `entries` + `categories` + `budgets`. The Accounts plan (concern #1) extends `wipeAllData` to also clear `accounts` — a `// ponytail:` comment in Task 5 marks the spot.

---

### Task 1: Toast store + public API

**Files:**
- Create: `src/shared/ui/toast.ts`
- Test: `src/shared/ui/toast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/ui/toast.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { toast, getToasts, dismissToast, resetToasts } from './toast';

describe('toast store', () => {
  beforeEach(() => resetToasts());

  it('toast(message) pushes a polite toast and returns its id', () => {
    const id = toast('Saved');
    const all = getToasts();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id, message: 'Saved', tone: 'polite' });
    expect(all[0].action).toBeUndefined();
  });

  it('toast.action attaches a label + onClick', () => {
    const onClick = () => {};
    toast.action('Merged into Cash', { label: 'Undo', onClick });
    const [t] = getToasts();
    expect(t.action).toEqual({ label: 'Undo', onClick });
  });

  it('toast.error marks the tone assertive', () => {
    toast.error('Import failed');
    expect(getToasts()[0].tone).toBe('assertive');
  });

  it('dismissToast removes only the matching toast', () => {
    const a = toast('A');
    const b = toast('B');
    dismissToast(a);
    expect(getToasts().map((t) => t.id)).toEqual([b]);
  });

  it('ids are unique and increasing', () => {
    const a = toast('A');
    const b = toast('B');
    expect(b).toBeGreaterThan(a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/ui/toast.test.ts`
Expected: FAIL — `Failed to resolve import "./toast"` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/ui/toast.ts`:

```ts
// Module-level toast store + public API. Any code (a client component, a server-action caller) can
// call toast('Saved') without threading a React context — the single ToastRegion mounted in
// layout.tsx subscribes to this store via useToasts. Deliberately a tiny hand-rolled store (no
// sonner/Radix): the app is local-first and few-deps by design.

export type ToastTone = 'polite' | 'assertive';
export type ToastAction = { label: string; onClick: () => void };
export type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
};

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

// useSyncExternalStore contract: subscribe returns an unsubscribe; getToasts returns a stable
// reference between mutations (we only reassign `toasts` on change) so React can bail out of renders.
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): Toast[] {
  return toasts;
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

// Test hook: drop every toast. nextId is NOT reset, so ids stay unique across a whole test file.
export function resetToasts(): void {
  toasts = [];
  emit();
}

function push(message: string, tone: ToastTone, action?: ToastAction): number {
  const id = nextId++;
  toasts = [...toasts, { id, message, tone, action }];
  emit();
  return id;
}

type ToastApi = {
  (message: string): number;
  action: (message: string, action: ToastAction) => number;
  error: (message: string) => number;
};

// Object.assign gives the callable + its variants as one value with an inferred intersection type —
// assignable to ToastApi with no cast.
export const toast: ToastApi = Object.assign((message: string) => push(message, 'polite'), {
  action: (message: string, action: ToastAction) => push(message, 'polite', action),
  error: (message: string) => push(message, 'assertive'),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/ui/toast.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/toast.ts src/shared/ui/toast.test.ts
git commit -m "feat(shared): add zero-dep toast store + public API" \
  -m "Module-level singleton store (subscribe/getToasts/dismissToast/resetToasts) and a toast() API with .action (Undo) and .error variants. Any code can call toast() without a context; the ToastRegion subscribes via useToasts. No sonner/Radix." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

### Task 2: `useToasts` hook (auto-dismiss + pause/resume)

**Files:**
- Create: `src/shared/ui/use-toasts.ts`
- Test: `src/shared/ui/use-toasts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/ui/use-toasts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/ui/use-toasts.test.ts`
Expected: FAIL — `Failed to resolve import "./use-toasts"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/ui/use-toasts.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/shared/ui/use-toasts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shared/ui/use-toasts.ts src/shared/ui/use-toasts.test.ts
git commit -m "feat(shared): add useToasts hook with pausable auto-dismiss" \
  -m "useSyncExternalStore-backed hook owning per-toast ~5s auto-dismiss timers; pause() clears a timer (hover/focus), resume() reschedules it. Clears all timers on unmount." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

### Task 3: `ToastRegion` component + CSS + mount in layout

**Files:**
- Create: `src/shared/ui/ToastRegion.tsx`
- Test: `src/shared/ui/ToastRegion.test.tsx`
- Modify: `src/app/globals.css` (append `.toast-region` + `.toast` + `@keyframes toast-in`)
- Modify: `src/app/layout.tsx` (import + render `<ToastRegion />`)

- [ ] **Step 1: Write the failing test**

Create `src/shared/ui/ToastRegion.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastRegion } from './ToastRegion';
import { toast, resetToasts } from './toast';

describe('ToastRegion', () => {
  beforeEach(() => resetToasts());

  it('renders a queued toast inside a polite live region', () => {
    render(<ToastRegion />);
    act(() => {
      toast('Saved');
    });
    const region = screen.getByText('Saved').closest('[aria-live]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
  });

  it('an error toast lands in the assertive region', () => {
    render(<ToastRegion />);
    act(() => {
      toast.error('Import failed');
    });
    const region = screen.getByText('Import failed').closest('[aria-live]');
    expect(region?.getAttribute('aria-live')).toBe('assertive');
  });

  it('the action button invokes onClick and dismisses the toast', () => {
    const onClick = vi.fn();
    render(<ToastRegion />);
    act(() => {
      toast.action('Merged into Cash', { label: 'Undo', onClick });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Merged into Cash')).toBeNull();
  });

  it('the dismiss button removes the toast', () => {
    render(<ToastRegion />);
    act(() => {
      toast('Saved');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/ui/ToastRegion.test.tsx`
Expected: FAIL — `Failed to resolve import "./ToastRegion"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/ui/ToastRegion.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToasts } from './use-toasts';
import type { Toast } from './toast';

// One region mounted in layout.tsx. Two stable aria-live containers (polite for normal, assertive
// for errors) so screen readers announce new toasts without the whole list being re-read. Timers +
// pause/resume come from useToasts; hover/focus pauses the hovered toast's auto-dismiss.
export function ToastRegion() {
  const { toasts, dismiss, pause, resume } = useToasts();
  const [mounted, setMounted] = useState(false);

  // Portal target (document.body) only exists client-side; render nothing until mounted.
  useEffect(() => setMounted(true), []);
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
```

- [ ] **Step 4: Append CSS to `src/app/globals.css`**

Add at the end of the file (after the `@media (prefers-reduced-motion: reduce)` block — the existing block already neutralizes the `toast-in` animation for reduced-motion users):

```css
/* Toasts — stacked above the bottom bar, centered to the phone column. The region is click-through
   (pointer-events:none) so it never blocks the bar; each toast re-enables pointer events. z-toast
   (300) sits above the header/dropdown scale. */
.toast-region {
  position: fixed;
  inset: auto 0 96px 0;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding: 0 1rem;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-strong);
  box-shadow: var(--shadow-2);
  color: var(--color-text);
  font-size: 0.875rem;
  animation: toast-in var(--dur) var(--ease-out);
}
@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 5: Mount in `src/app/layout.tsx`**

Add the import alongside the other `@shared/ui` imports (near line 13):

```tsx
import { ToastRegion } from '@shared/ui/ToastRegion';
```

Render it just after `<BottomBar />`, still inside `<CategoryPickerProvider>` (it portals to `document.body`, so position in the tree is cosmetic — keep it in the provider for consistency):

```tsx
          <BottomBar />
          <ToastRegion />
        </CategoryPickerProvider>
```

- [ ] **Step 6: Run tests + typecheck to verify green**

Run: `npm test -- src/shared/ui/ToastRegion.test.tsx`
Expected: PASS (4 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ui/ToastRegion.tsx src/shared/ui/ToastRegion.test.tsx src/app/globals.css src/app/layout.tsx
git commit -m "feat(shared): add ToastRegion portal and mount it in layout" \
  -m "Two stable aria-live containers (polite/assertive) portaled to document.body; per-toast Undo + Dismiss buttons; hover/focus pauses auto-dismiss. Adds .toast-region/.toast tokens to globals.css and renders <ToastRegion/> in the root layout." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

### Task 4: `ConfirmDialog` primitive + CSS

**Files:**
- Create: `src/shared/ui/ConfirmDialog.tsx`
- Test: `src/shared/ui/ConfirmDialog.test.tsx`
- Modify: `src/app/globals.css` (append `.confirm-dialog`)

- [ ] **Step 1: Write the failing test**

Create `src/shared/ui/ConfirmDialog.test.tsx`. Note the `showModal`/`close` stubs — jsdom's `<dialog>` support is partial, so we stub them (mirroring how `CategoryNameEditor.test.tsx` stubs `HTMLFormElement.prototype.requestSubmit`). Setting `.open` via the intact property setter reflects to the `open` attribute, which we assert with `hasAttribute` (no cast needed):

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

function stubDialog() {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
}

const baseProps = {
  open: true,
  title: 'Wipe all data?',
  body: 'Delete all entries, categories, and accounts. This cannot be undone.',
  confirmLabel: 'Delete everything',
  destructive: true,
};

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubDialog();
  });

  it('invokes onConfirm then onClose when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Cancel closes without confirming', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking the backdrop (the dialog element itself) closes without confirming', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog', { hidden: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('applies destructive styling to the confirm button', () => {
    render(<ConfirmDialog {...baseProps} destructive onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete everything' }).style.background).toBe(
      'var(--color-loss)',
    );
  });

  it('opens/closes the native dialog in step with the open prop', () => {
    const { rerender } = render(
      <ConfirmDialog {...baseProps} open={false} onConfirm={() => {}} onClose={() => {}} />,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('open')).toBe(false);
    rerender(<ConfirmDialog {...baseProps} open onConfirm={() => {}} onClose={() => {}} />);
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/shared/ui/ConfirmDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./ConfirmDialog"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shared/ui/ConfirmDialog.tsx` (mirrors `MoreSheet`'s imperative `showModal()`/`close()` effect + backdrop-click-to-close):

```tsx
'use client';

import { useEffect, useRef } from 'react';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

// Reusable yes/no confirm on the native <dialog> — same pattern as MoreSheet (showModal gives
// focus-trap, Esc, ::backdrop, top-layer stacking for free). Deliberately minimal props: no
// variant/icon/size config-explosion. `destructive` reddens the confirm button (--color-loss).
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click (target is the dialog itself)
      }}
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {body}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            style={{
              background: destructive ? 'var(--color-loss)' : 'var(--color-accent)',
              color: 'var(--color-on-accent)',
            }}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 4: Append CSS to `src/app/globals.css`**

Add after the existing `.emoji-dialog` block (it's the sibling centered-modal pattern):

```css
/* Centered confirm modal <dialog> — same chrome as .emoji-dialog. showModal() supplies focus-trap,
   Esc and the ::backdrop. */
.confirm-dialog {
  margin: auto;
  width: calc(100% - 2rem);
  max-width: 360px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
}
.confirm-dialog::backdrop {
  background: rgba(0, 0, 0, 0.5);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/shared/ui/ConfirmDialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/ui/ConfirmDialog.tsx src/shared/ui/ConfirmDialog.test.tsx src/app/globals.css
git commit -m "feat(shared): add native-dialog ConfirmDialog primitive" \
  -m "Reusable yes/no confirm on <dialog> reusing MoreSheet's showModal/Esc/backdrop pattern. Minimal props (title/body/confirmLabel/onConfirm/destructive); destructive reddens the confirm button. Adds .confirm-dialog chrome to globals.css." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

### Task 5: `wipeAllData` query (transactional delete-all)

**Files:**
- Create: `src/features/settings/data.ts`
- Test: `src/features/settings/data.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/data.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable, entries } from '@features/entries/schema';
import { ensureCategoriesTable, categories } from '@features/categories/schema';
import { ensureBudgetsTable, budgets } from '@features/budgets/schema';
import { insertEntry } from '@features/entries/queries';
import { setBudget } from '@features/budgets/queries';
import { wipeAllData } from './data';

describe('wipeAllData', () => {
  it('clears entries, categories, and budgets in one shot', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    ensureCategoriesTable(db);
    ensureBudgetsTable(db);

    insertEntry(db, { date: '2026-07-01', account: 'Cash', category: 'Coffee', amount: -80 });
    insertEntry(db, { date: '2026-07-02', account: 'Card', category: 'Groceries', amount: -500 });
    setBudget(db, 'Coffee', 1000);
    setBudget(db, null, 20000); // the total-budget row

    expect(db.select().from(entries).all()).toHaveLength(2);
    expect(db.select().from(categories).all().length).toBeGreaterThan(0);
    expect(db.select().from(budgets).all().length).toBeGreaterThan(0);

    wipeAllData(db);

    expect(db.select().from(entries).all()).toEqual([]);
    expect(db.select().from(categories).all()).toEqual([]);
    expect(db.select().from(budgets).all()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/settings/data.test.ts`
Expected: FAIL — `Failed to resolve import "./data"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/settings/data.ts`:

```ts
import type { Db } from '@db/client';
import { entries } from '@features/entries/schema';
import { categories } from '@features/categories/schema';
import { budgets } from '@features/budgets/schema';

// Irreversible "wipe all data": clears the whole ledger, all categories, and their budgets in one
// transaction (no soft-delete — that's the point, and why the UI confirm-gates it). Entries and
// budgets reference categories, so they're deleted first.
// ponytail: the accounts table is added by the accounts feature (concern #1); extend this to also
// `tx.delete(accounts).run()` when that table lands.
export function wipeAllData(db: Db): void {
  db.transaction((tx) => {
    tx.delete(entries).run();
    tx.delete(budgets).run();
    tx.delete(categories).run();
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/settings/data.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/data.ts src/features/settings/data.test.ts
git commit -m "feat(features): add transactional wipeAllData for settings" \
  -m "Clears entries + budgets + categories in one transaction (delete order respects the category FK). Irreversible by design; the accounts table joins the wipe in concern #1 (marked with a ponytail comment)." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

### Task 6: "Wipe all data" action + settings UI (first ConfirmDialog caller)

**Files:**
- Modify: `src/features/settings/actions.ts` (add `wipeAllDataAction`)
- Create: `src/features/settings/ui/WipeAllData.tsx`
- Test: `src/features/settings/ui/WipeAllData.test.tsx`
- Modify: `src/app/settings/page.tsx` (render `<WipeAllData />` in a "Danger zone" panel)

- [ ] **Step 1: Add the server action**

Append to `src/features/settings/actions.ts` (add the two schema imports at the top alongside the existing imports, then the action):

```ts
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { wipeAllData } from './data';
```

```ts
// Irreversible: clear every entry, category, and budget, then revalidate the whole app so all
// surfaces re-render empty. Confirm-gated in the UI (WipeAllData + ConfirmDialog).
export async function wipeAllDataAction(): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  ensureCategoriesTable(db);
  wipeAllData(db);
  revalidatePath('/', 'layout');
}
```

- [ ] **Step 2: Write the failing component test**

Create `src/features/settings/ui/WipeAllData.test.tsx`. The server action and toast are mocked so the test never touches the real DB:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@features/settings/actions', () => ({
  wipeAllDataAction: vi.fn(() => Promise.resolve()),
}));
vi.mock('@shared/ui/toast', () => ({ toast: vi.fn() }));

import { WipeAllData } from './WipeAllData';
import { wipeAllDataAction } from '@features/settings/actions';
import { toast } from '@shared/ui/toast';

function stubDialog() {
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
}

describe('WipeAllData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDialog();
  });

  it('opens the confirm dialog on click', () => {
    render(<WipeAllData />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all data' }));
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('confirming calls the wipe action and toasts', async () => {
    render(<WipeAllData />);
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(wipeAllDataAction).toHaveBeenCalledOnce();
    await Promise.resolve(); // let the awaited action settle before the toast fires
    expect(toast).toHaveBeenCalledWith('All data cleared');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/features/settings/ui/WipeAllData.test.tsx`
Expected: FAIL — `Failed to resolve import "./WipeAllData"`.

- [ ] **Step 4: Write the component**

Create `src/features/settings/ui/WipeAllData.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { wipeAllDataAction } from '@features/settings/actions';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { toast } from '@shared/ui/toast';

// The first real ConfirmDialog caller: a destructive "Wipe all data" button gated by a confirm.
// On confirm, run the server action then toast. (Concern #3's Drive restore reuses this same
// ConfirmDialog for its overwrite gate.)
export function WipeAllData() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-fit"
        style={{ color: 'var(--color-loss)' }}
        onClick={() => setOpen(true)}
      >
        Wipe all data
      </button>
      <ConfirmDialog
        open={open}
        title="Wipe all data?"
        body="Delete all entries, categories, and accounts. This cannot be undone."
        confirmLabel="Delete everything"
        destructive
        onConfirm={async () => {
          await wipeAllDataAction();
          toast('All data cleared');
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/settings/ui/WipeAllData.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Render it in the settings page**

In `src/app/settings/page.tsx`, add the import near the other imports:

```tsx
import { WipeAllData } from '@features/settings/ui/WipeAllData';
```

Add a "Danger zone" panel as the last `<section>` inside `<PageContainer>` (after the icon-set section, before `</PageContainer>`):

```tsx
      <section className="panel flex flex-col gap-3 p-5" style={{ borderColor: 'var(--color-loss)' }}>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-loss)' }}>
          Danger zone
        </h2>
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Permanently delete every entry, category, and budget. This cannot be undone — there is no
          backup yet.
        </p>
        <WipeAllData />
      </section>
```

- [ ] **Step 7: Run the full gates**

Run each separately:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

Expected: all pass. (If `format:check` flags the touched files, run `npm run format:files <files>` and re-check.)

- [ ] **Step 8: Commit**

```bash
git add src/features/settings/actions.ts src/features/settings/ui/WipeAllData.tsx src/features/settings/ui/WipeAllData.test.tsx src/app/settings/page.tsx
git commit -m "feat(features): add confirm-gated Wipe all data to settings" \
  -m "wipeAllDataAction server action + a WipeAllData 'Danger zone' button that opens ConfirmDialog and, on confirm, wipes data and toasts 'All data cleared'. This is ConfirmDialog's first real caller; Drive restore (concern #3) reuses it." \
  -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Nd89nCpyxLn93xrssoVHE8"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- `toast()` module API + `.action` + tone → Task 1. ✓
- `use-toasts` hook (auto-dismiss, manual dismiss, pause on hover/focus, undo) → Task 2. ✓
- `ToastRegion` (aria-live polite/assertive, stackable, reduced-motion via existing global block, portal, mounted in layout) → Task 3. ✓
- `ConfirmDialog` (native `<dialog>`, title/body/confirmLabel/onConfirm/destructive, no config-explosion) → Task 4. ✓
- "Wipe all data" settings caller + transactional server action → Tasks 5 + 6. ✓
- All four items in the spec's Testing section have a test (use-toasts, ToastRegion, ConfirmDialog, wipe-all). ✓
- Out-of-scope honored: no Radix/sonner, no toast positions/queue-limits/promise-toasts, no soft-delete. ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code. ✓

**Type consistency across tasks:** `toast`/`toast.action`/`toast.error`, `Toast`/`ToastAction`/`ToastTone`, `getToasts`/`dismissToast`/`subscribe`/`resetToasts`, `useToasts(): UseToasts` with `{toasts, dismiss, pause, resume}`, `ConfirmDialogProps`, `wipeAllData`/`wipeAllDataAction` — names identical everywhere they appear. ✓

## Decisions / ambiguities resolved

1. **Wipe scope.** Spec copy says "entries, categories, and accounts", but accounts don't exist yet (this is built before concern #1). Resolved: wipe clears **entries + budgets + categories** now (budgets would orphan otherwise), with a `// ponytail:` marker to add `accounts` in the Accounts plan. Settings (cutoff, icon set) are preferences, not "data" — deliberately kept.
2. **`wipeAllData` location.** Put in a new `src/features/settings/data.ts` (owns the destructive cross-table query, imports the three feature schemas). This adds a thin settings→entries/categories/budgets edge, consistent with the existing entries→categories/budgets cross-feature schema imports; not graduated to `shared/`.
3. **jsdom `<dialog>`.** Stub `HTMLDialogElement.prototype.showModal`/`close` in dialog tests (mirrors the repo's existing `requestSubmit` stub in `CategoryNameEditor.test.tsx`) and assert open state via `hasAttribute('open')` to avoid a cast.
4. **`toast` typing without `as`.** Built via `Object.assign(fn, {action, error})` whose inferred intersection is assignable to the `ToastApi` type — no `as`, no `!`.
5. **a11y regions.** Two stable `aria-live` containers (polite + assertive) rather than per-toast live regions, so adding a toast announces cleanly. Overlap of the two is flagged as an accepted ponytail edge.
6. **Toast API surface.** Added `toast.error` (assertive tone) beyond the spec's `toast()`/`toast.action` because the assertive region needed a caller; it's one line and no new concepts. Flag if you'd rather drop it.
