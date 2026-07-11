'use client';

import type { RefObject } from 'react';
import { EMOJI_CHOICES, EMOJI_LABELS } from '../queries';
import { CategoryIcon } from './CategoryIcon';
import { CategoryNameEditor } from './CategoryNameEditor';
import { iconMapFor } from '../icon-for';
import { categoryColorBold, HUE_PRESETS } from '../color';
import { setCategoryEmojiAction, setCategoryHueAction } from '../actions';
import type { IconSet } from '@features/settings/queries';

// The icon + background picker as a *controlled* native <dialog>: the caller owns the ref (and calls
// showModal) and passes which category is being edited. `category === null` renders an empty dialog
// so a single instance can be shared across a whole page (records) and re-pointed at whichever row
// was tapped — the per-instance EmojiPicker (categories page) just always passes a category. Each
// field is its own server-action form; picking submits and closes the dialog, and revalidation
// repaints every surface. Closing (Esc / backdrop / submit) routes through the dialog's onClose so
// the owner can clear its state.
export function CategoryPickerDialog({
  category,
  current,
  hue,
  iconSet,
  dialogRef,
  onClose,
}: {
  category: string | null;
  current: string;
  hue?: number;
  iconSet: IconSet;
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
}) {
  const iconMap = iconMapFor(iconSet);
  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      className="emoji-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) close();
      }}
    >
      {category !== null && (
        <div className="flex flex-col gap-3 p-4">
          {/* Live preview of the current icon on its current background; tap the name to rename it
              (closes the dialog on submit, since the old category key no longer exists). */}
          <div className="flex items-center gap-3">
            <CategoryIcon emoji={current} name={category} size="lg" iconSet={iconSet} hue={hue} />
            <CategoryNameEditor category={category} onDone={close} />
          </div>

          <h2 className="text-sm font-semibold">Icon</h2>
          <form action={setCategoryEmojiAction} onSubmit={close} className="grid grid-cols-8 gap-1">
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

          <h2 className="mt-1 text-sm font-semibold">Background</h2>
          <form action={setCategoryHueAction} onSubmit={close} className="flex flex-wrap gap-2">
            <input type="hidden" name="category" value={category} />
            {HUE_PRESETS.map((preset) => {
              const selected = hue === preset.hue;
              return (
                <button
                  key={preset.hue}
                  type="submit"
                  name="hue"
                  value={preset.hue}
                  aria-label={preset.name}
                  aria-pressed={selected}
                  title={preset.name}
                  className={`size-8 rounded-full transition-transform active:opacity-70 ${
                    selected ? 'ring-2 ring-offset-2 ring-offset-[var(--color-surface)]' : ''
                  }`}
                  style={{ background: categoryColorBold(preset.name, preset.hue) }}
                />
              );
            })}
            {/* Reset to the name-derived color. */}
            <button
              type="submit"
              name="hue"
              value="auto"
              aria-label="Automatic color"
              aria-pressed={hue === undefined}
              title="Auto"
              className={`grid size-8 place-items-center rounded-full border text-[10px] font-medium transition-colors hover:bg-[var(--color-surface-2)] active:opacity-70 ${
                hue === undefined ? 'ring-2 ring-offset-2 ring-offset-[var(--color-surface)]' : ''
              }`}
              style={{ color: 'var(--color-muted)' }}
            >
              Auto
            </button>
          </form>
        </div>
      )}
    </dialog>
  );
}
