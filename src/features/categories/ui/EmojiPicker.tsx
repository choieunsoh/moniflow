'use client';

import { useRef } from 'react';
import { CategoryIcon } from './CategoryIcon';
import { CategoryPickerDialog } from './CategoryPickerDialog';
import type { IconSet } from '@features/settings/queries';

// Per-category trigger: tap the marker to open its own icon + background picker. Used on the
// Categories page, where the category count is bounded (one picker per distinct category). The
// records list instead shares ONE dialog for the whole page — see CategoryPickerProvider — since a
// dialog per row balloons the DOM. Both render the same CategoryPickerDialog body.
export function EmojiPicker({
  category,
  current,
  iconSet,
  currentHue,
}: {
  category: string;
  current: string;
  iconSet: IconSet;
  currentHue?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={`Choose icon for ${category}`}
        title={`Change icon for ${category}`}
        className="shrink-0 rounded-full transition-opacity active:opacity-70"
      >
        <CategoryIcon
          emoji={current}
          name={category}
          size="md"
          iconSet={iconSet}
          hue={currentHue}
        />
      </button>

      <CategoryPickerDialog
        category={category}
        current={current}
        hue={currentHue}
        iconSet={iconSet}
        dialogRef={ref}
        onClose={() => {}}
      />
    </>
  );
}
