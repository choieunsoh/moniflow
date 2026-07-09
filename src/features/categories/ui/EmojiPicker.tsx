'use client';

import { useRef } from 'react';
import { EMOJI_CHOICES, EMOJI_LABELS } from '../queries';
import { CategoryIcon } from './CategoryIcon';
import { iconMapFor } from '../icon-for';
import { setCategoryEmojiAction } from '../actions';
import type { IconSet } from '@features/settings/queries';

// Tap the current marker to open a native <dialog> grid; picking one submits the assignment (a single
// form whose clicked button carries the emoji value) and the dialog closes on navigation/revalidate.
// Each choice renders in the active icon set (emoji stays the stored key), so what you pick matches
// what the rest of the app shows.
export function EmojiPicker({
  category,
  current,
  iconSet,
}: {
  category: string;
  current: string;
  iconSet: IconSet;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const iconMap = iconMapFor(iconSet);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={`Choose icon for ${category}`}
        title={`Change icon for ${category}`}
        className="shrink-0 rounded-full transition-opacity active:opacity-70"
      >
        <CategoryIcon emoji={current} name={category} size="md" iconSet={iconSet} />
      </button>

      <dialog
        ref={ref}
        className="emoji-dialog"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">
            Icon for <span style={{ color: 'var(--color-muted)' }}>{category}</span>
          </h2>
          <form
            action={setCategoryEmojiAction}
            onSubmit={() => ref.current?.close()}
            className="grid grid-cols-8 gap-1"
          >
            <input type="hidden" name="category" value={category} />
            {EMOJI_CHOICES.map((emoji) => {
              const label = EMOJI_LABELS[emoji] ?? emoji;
              const Marker = iconMap?.[emoji];
              return (
                <button
                  key={emoji}
                  type="submit"
                  name="emoji"
                  value={emoji}
                  aria-label={`Set ${label}`}
                  title={label}
                  className="grid aspect-square w-full place-items-center rounded-[var(--radius-sm)] text-xl transition-colors hover:bg-[var(--color-surface-2)] active:opacity-70"
                >
                  {Marker ? <Marker size={22} /> : emoji}
                </button>
              );
            })}
          </form>
        </div>
      </dialog>
    </>
  );
}
