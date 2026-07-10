'use client';

import { useRef } from 'react';
import { EMOJI_CHOICES, EMOJI_LABELS } from '../queries';
import { CategoryIcon } from './CategoryIcon';
import { iconMapFor } from '../icon-for';
import { categoryColorBold, HUE_PRESETS } from '../color';
import { setCategoryEmojiAction, setCategoryHueAction } from '../actions';
import type { IconSet } from '@features/settings/queries';

// Tap the current marker to open a native <dialog>; pick an icon (top grid) or a background color
// (swatch row) — each is its own form whose clicked button carries the value, and the dialog closes on
// navigation/revalidate. Icons render in the active set (emoji stays the stored key) so what you pick
// matches what the rest of the app shows.
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
        <CategoryIcon
          emoji={current}
          name={category}
          size="md"
          iconSet={iconSet}
          hue={currentHue}
        />
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

          <h2 className="mt-1 text-sm font-semibold">Background</h2>
          <form
            action={setCategoryHueAction}
            onSubmit={() => ref.current?.close()}
            className="flex flex-wrap gap-2"
          >
            <input type="hidden" name="category" value={category} />
            {HUE_PRESETS.map((preset) => {
              const selected = currentHue === preset.hue;
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
              aria-pressed={currentHue === undefined}
              title="Auto"
              className={`grid size-8 place-items-center rounded-full border text-[10px] font-medium transition-colors hover:bg-[var(--color-surface-2)] active:opacity-70 ${
                currentHue === undefined
                  ? 'ring-2 ring-offset-2 ring-offset-[var(--color-surface)]'
                  : ''
              }`}
              style={{ color: 'var(--color-muted)' }}
            >
              Auto
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
