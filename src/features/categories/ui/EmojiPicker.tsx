'use client';

import { useRef } from 'react';
import { EMOJI_CHOICES, EMOJI_LABELS } from '../queries';
import { categoryColor } from '../color';
import { setCategoryEmojiAction } from '../actions';

// Tap the current emoji to open a native <dialog> grid; picking one submits the assignment (a single
// form whose clicked button carries the emoji value) and the dialog closes on navigation/revalidate.
export function EmojiPicker({ category, current }: { category: string; current: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={`Choose emoji for ${category}`}
        title={`Change emoji for ${category}`}
        className="grid size-10 shrink-0 place-items-center rounded-full text-xl transition-colors active:opacity-70"
        style={{ background: `color-mix(in srgb, ${categoryColor(category)} 22%, transparent)` }}
      >
        {current}
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
            Emoji for <span style={{ color: 'var(--color-muted)' }}>{category}</span>
          </h2>
          <form
            action={setCategoryEmojiAction}
            onSubmit={() => ref.current?.close()}
            className="grid grid-cols-8 gap-1"
          >
            <input type="hidden" name="category" value={category} />
            {EMOJI_CHOICES.map((emoji) => {
              const label = EMOJI_LABELS[emoji] ?? emoji;
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
                  {emoji}
                </button>
              );
            })}
          </form>
        </div>
      </dialog>
    </>
  );
}
