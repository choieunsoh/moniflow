'use client';

import { useRef } from 'react';
import { AccountIcon } from './AccountIcon';
import { AccountGlyph } from './AccountGlyph';
import { AccountNameEditor } from './AccountNameEditor';
import { ACCOUNT_ICONS } from '../queries';
// ponytail: HUE_PRESETS/categoryColorBold are imported laterally from features/categories rather
// than graduated to shared — a deliberate call while accounts is only the 2nd consumer. Graduate
// color (and merge-guard, per AccountNameEditor) to @shared/ when a 3rd consumer appears.
import { HUE_PRESETS, categoryColorBold } from '@features/categories/color';
import { setAccountIconAction, setAccountHueAction } from '../actions';

// Per-account icon + background picker as a native <dialog> (inherits focus-trap, Esc, ::backdrop from
// showModal). Tap the account disc to open. Each field is its own server-action form; picking submits and
// closes, and revalidation repaints every surface. Reuses the categories .emoji-dialog chrome/class and
// HUE_PRESETS/categoryColorBold (imported, not graduated). One instance per account row — the account
// list is short, so no shared-dialog provider is needed (unlike /records categories).
export function AccountIconPicker({
  account,
  current,
  hue,
}: {
  account: string;
  current: string;
  hue?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-label={`Choose icon for ${account}`}
        title={`Change icon for ${account}`}
        className="shrink-0 rounded-full transition-opacity active:opacity-70"
      >
        <AccountIcon icon={current} name={account} size="md" hue={hue} />
      </button>

      <dialog
        ref={ref}
        className="emoji-dialog"
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <AccountIcon icon={current} name={account} size="lg" hue={hue} />
            <AccountNameEditor account={account} onDone={close} />
          </div>

          <h2 className="text-sm font-semibold">Icon</h2>
          <form action={setAccountIconAction} onSubmit={close} className="grid grid-cols-8 gap-1">
            <input type="hidden" name="account" value={account} />
            {ACCOUNT_ICONS.map((icon) => (
              <button
                key={icon}
                type="submit"
                name="icon"
                value={icon}
                aria-label={`Set ${icon}`}
                title={icon}
                className="grid aspect-square w-full place-items-center rounded-[var(--radius-sm)] transition-colors hover:bg-[var(--color-surface-2)] active:opacity-70"
              >
                <AccountGlyph icon={icon} size={22} />
              </button>
            ))}
          </form>

          <h2 className="mt-1 text-sm font-semibold">Background</h2>
          <form action={setAccountHueAction} onSubmit={close} className="flex flex-wrap gap-2">
            <input type="hidden" name="account" value={account} />
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
      </dialog>
    </>
  );
}
