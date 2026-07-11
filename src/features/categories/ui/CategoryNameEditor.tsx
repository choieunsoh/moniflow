'use client';

import { useState } from 'react';
import { mergeCategoryAction } from '@features/entries/actions';

// Tap the category name to rename it inline — or type an existing name to merge this category into
// that one (the shared #category-options datalist autocompletes). Collapsed to a plain label until
// tapped so the list stays calm. Saves on blur or Enter (no Apply button); a blur that's unchanged
// or empty just collapses back to the label without submitting, so clicking an icon/colour swatch in
// the dialog doesn't fire a no-op rename. Esc restores the original and cancels. `onDone` fires on an
// actual submit — the icon/bg dialog passes it to close the modal after a rename.
export function CategoryNameEditor({
  category,
  onDone,
}: {
  category: string;
  onDone?: () => void;
}) {
  const [editing, setEditing] = useState(false);

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
        onBlur={(e) => {
          const next = e.currentTarget.value.trim();
          if (next && next !== category) e.currentTarget.form?.requestSubmit();
          else setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
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
