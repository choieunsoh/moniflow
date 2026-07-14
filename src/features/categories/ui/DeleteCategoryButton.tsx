'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteCategoryAction } from '@features/entries/actions';
import { withSaveToast } from '@shared/ui/with-save-toast';

// Two-tap arm-in-place delete for an unused (count 0) category — mobile-friendly, no modal, no focus
// loop. First tap arms: the muted trash turns into a red "Delete" confirm that auto-reverts after 3s;
// the second tap commits. It's ONE button that changes role (not two swapped elements) so keyboard
// focus stays put and screen readers hear the label change. Deleting an empty category is zero-stakes,
// so this soft confirm is only there to stop a fat-finger tap — deliberate enough, no dialog.
export function DeleteCategoryButton({ category }: { category: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []); // clear the pending disarm on unmount

  function arm() {
    setArmed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setArmed(false), 3000);
  }

  return (
    <form action={withSaveToast(deleteCategoryAction, 'Category deleted')} className="shrink-0">
      <input type="hidden" name="name" value={category} />
      <button
        type="button"
        onClick={armed ? (e) => e.currentTarget.form?.requestSubmit() : arm}
        aria-label={armed ? `Confirm delete ${category}` : `Delete ${category}`}
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
