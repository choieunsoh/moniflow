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
