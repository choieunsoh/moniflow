'use client';

import { useState } from 'react';
import { mergeCategoryAction } from '@features/entries/actions';
import { willMerge } from '../merge-guard';

// Tap the category name to rename it inline — or type an existing name to merge this category into
// that one (the shared #category-options datalist autocompletes). Collapsed to a plain label until
// tapped so the list stays calm. Saves on blur or Enter (no Apply button); a blur that's unchanged
// or empty just collapses back to the label without submitting, so clicking an icon/colour swatch in
// the dialog doesn't fire a no-op rename. Esc restores the original and cancels. `onDone` fires on an
// actual submit — the icon/bg dialog passes it to close the modal after a rename.
//
// Typing an EXISTING name folds this category into it (a merge) — irreversible, so we confirm first.
// Both save paths (blur, Enter) route through attemptSubmit, which only calls requestSubmit() once the
// guard passes, so the server action never fires on an un-confirmed merge (no reliance on cancelling
// an in-flight action). ponytail: the confirm is only active where #category-options is rendered (the
// categories page, which is also where autocomplete suggests existing names); the records dialog has
// no datalist, so a blind-typed collision there still merges silently — pass the name set as a prop if
// that surface needs guarding too.
export function CategoryNameEditor({
  category,
  onDone,
}: {
  category: string;
  onDone?: () => void;
}) {
  const [editing, setEditing] = useState(false);

  // The single save path for both blur and Enter: bail on an empty/unchanged value, confirm before an
  // irreversible merge, and only then submit the form (which runs mergeCategoryAction).
  function attemptSubmit(input: HTMLInputElement) {
    const next = input.value.trim();
    if (!next || next === category) {
      setEditing(false);
      return;
    }
    const existing = Array.from(
      document.querySelectorAll<HTMLOptionElement>('#category-options option'),
      (o) => o.value,
    );
    if (
      willMerge(next, category, existing) &&
      !window.confirm(`Merge “${category}” into “${next}”? This can’t be undone.`)
    ) {
      return; // leave the field open so the name can be corrected
    }
    input.form?.requestSubmit();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title={`Rename ${category}`}
        className="min-h-11 min-w-0 flex-1 truncate text-left font-medium"
      >
        {category}
      </button>
    );
  }

  return (
    <form
      action={mergeCategoryAction}
      onSubmit={() => onDone?.()}
      className="flex min-w-0 flex-1 items-center gap-2"
    >
      <input type="hidden" name="from" value={category} />
      <input
        name="to"
        list="category-options"
        defaultValue={category}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => attemptSubmit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            // Stop the native submit so the merge confirm runs before the action can fire.
            e.preventDefault();
            attemptSubmit(e.currentTarget);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            // Restore the original so the blur that follows is a clean no-op (cancel, don't save).
            e.currentTarget.value = category;
            setEditing(false);
          }
        }}
        required
        aria-label={`Rename ${category}`}
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      />
    </form>
  );
}
