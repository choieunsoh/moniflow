'use client';

import { useState } from 'react';
import { addCategoryAction } from '@features/entries/actions';
import { withSaveToast } from '@shared/ui/with-save-toast';

// Add a new empty category by name. The input is UNCONTROLLED, so React's form reset clears it after a
// successful submit and the action's FormData still reads the real DOM value; `draft` only mirrors the
// text to drive the disabled button + "already exists" hint (clearing `draft` on submit therefore never
// wipes the value FormData reads). Blank and duplicate names are blocked here for instant feedback —
// addCategory also no-ops on a dup and `name` is UNIQUE, so this is belt-and-suspenders. New categories
// get the fallback icon; restyle with the per-row picker.
export function AddCategory({ names }: { names: string[] }) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const exists = names.includes(trimmed);
  const canAdd = trimmed !== '' && !exists;

  return (
    <form
      action={withSaveToast(addCategoryAction, 'Category added')}
      onSubmit={(e) => {
        if (!canAdd) e.preventDefault();
        else setDraft(''); // reset the hint/disabled state; the uncontrolled input clears itself
      }}
      className="flex w-full items-center gap-2"
    >
      <input
        name="name"
        onChange={(e) => setDraft(e.currentTarget.value)}
        placeholder="Add category…"
        aria-label="Add category"
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      />
      {exists && (
        <span className="shrink-0 text-xs" style={{ color: 'var(--color-muted)' }}>
          already exists
        </span>
      )}
      <button
        type="submit"
        disabled={!canAdd}
        className="btn btn-primary shrink-0 disabled:pointer-events-none disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}
