import { toast } from './toast';

// Wrap a mutation (a client action returning Promise<void>) so a successful run shows a confirmation
// toast, and a failure shows an error toast and rethrows (preserving existing pending-state / error
// behavior). Used directly as a React form `action` prop: `action={withSaveToast(setCutoffAction)}`.
export function withSaveToast<A extends unknown[]>(
  action: (...args: A) => Promise<void>,
  message = 'Saved',
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await action(...args);
      toast(message);
    } catch (e) {
      toast.error('Couldn’t save — try again');
      throw e;
    }
  };
}
