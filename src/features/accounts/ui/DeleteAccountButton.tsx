'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteAccountAction } from '../actions';
import { withSaveToast } from '@shared/ui/with-save-toast';

// Two-tap arm-in-place delete for an unused (count 0) account — mobile-friendly, no modal. First tap
// arms (muted trash → red "Delete", auto-reverts after 3s); the second commits. ONE button that changes
// role so keyboard focus stays put and screen readers hear the label change. Mirrors DeleteCategoryButton.
export function DeleteAccountButton({ account }: { account: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function arm() {
    setArmed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), 3000);
  }

  return (
    <form action={withSaveToast(deleteAccountAction, 'Account deleted')} className="shrink-0">
      <input type="hidden" name="name" value={account} />
      <button
        type="button"
        onClick={armed ? (e) => e.currentTarget.form?.requestSubmit() : arm}
        aria-label={armed ? `Confirm delete ${account}` : `Delete ${account}`}
        className={
          armed
            ? 'tap rounded-[var(--radius-sm)] px-3 text-sm font-semibold transition-transform active:scale-95'
            : 'tap rounded-[var(--radius-sm)] px-2 transition-colors active:scale-95'
        }
        style={
          armed
            ? { background: 'var(--color-loss)', color: 'var(--color-on-accent)' }
            : { color: 'var(--color-faint)' }
        }
      >
        {armed ? 'Delete' : <Trash2 size={18} aria-hidden />}
      </button>
    </form>
  );
}
