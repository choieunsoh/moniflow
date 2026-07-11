'use client';

import { useState } from 'react';
import { mergeCategoryAction } from '@features/entries/actions';

// Tap the category name to rename it inline — or type an existing name to merge this category into
// that one (the shared #category-options datalist autocompletes). Collapsed to a plain label until
// tapped so the list stays calm. Submitting an unchanged name is a safe no-op: mergeCategoryAction
// rejects from === trimmed(to). Esc cancels. `onDone` fires on submit — used inside the icon/bg
// dialog to close it after a rename (Esc there stops at the input, so it cancels the rename without
// also closing the dialog).
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setEditing(false);
          }
        }}
        required
        aria-label={`Rename ${category}`}
        className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 text-base"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      />
      <button type="submit" className="btn btn-ghost">
        Apply
      </button>
    </form>
  );
}
