'use client';

import { useEffect, useState } from 'react';
import { ACCENTS, ACCENT_LABELS, ACCENT_STORAGE_KEY, readAccent, type Accent } from '../theme';
import { applyAccent } from '../use-theme';
import { setAccentAction } from '../actions';

/**
 * The accent axis, alongside ThemePicker's light/dark axis. Same three moves and the same reasons:
 * read the cache in an effect, stamp <html> on click, persist in the background.
 *
 * Choosing 'ink' REMOVES the attribute, so the default palette is the bare :root and can never
 * drift from it.
 *
 * Nine swatches in a 3x3 grid, not a wrapping flex row: `flex-wrap` with `flex-1` packs as many
 * 44px-minimum targets into the first line as fit and stretches the remainder across the second,
 * which on a 412px column gives an uneven split. A grid sized by COUNT cannot do that.
 *
 * A `group` of toggle buttons, deliberately NOT a `radiogroup`. The ARIA radio pattern promises a
 * single tab stop and arrow-key cycling, and neither is implemented here — a screen reader would
 * announce "radio button, 1 of 9" and set an expectation the control does not keep. Building roving
 * tabindex for an accent picker on a phone is not worth it; claiming a contract we do not honour is
 * worse than not claiming it. `aria-pressed` says what is actually true.
 */
export function AccentPicker() {
  const [accent, setAccent] = useState<Accent>('ink');

  useEffect(() => {
    void Promise.resolve().then(() => {
      setAccent(readAccent(localStorage.getItem(ACCENT_STORAGE_KEY)));
    });
  }, []);

  function choose(value: Accent) {
    setAccent(value);
    applyAccent(value);
    void setAccentAction(value);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend id="accent-legend" className="text-sm font-medium">
        App colour
      </legend>
      <div
        role="group"
        aria-labelledby="accent-legend"
        className="grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border p-1"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
      >
        {ACCENTS.map((value) => {
          const active = value === accent;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              // Every swatch stamps its own palette, ink included. Leaving the default unstamped
              // makes it inherit from :root, so the first dot shows whatever is CURRENTLY selected
              // instead of the ink it offers. <html> still goes unstamped for ink — there the
              // absence is the point, and globals.css keeps the two definitions equal.
              data-accent={value}
              onClick={() => choose(value)}
              className="tap flex min-h-11 flex-col items-center justify-center gap-1 rounded-[var(--radius-sm)] px-1 py-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]"
            >
              {/* `var(--action)`, NOT `var(--color-action)` — and this is the whole reason the
                  swatches can preview a palette at all.

                  Tailwind's @theme emits `--color-action: var(--action)` inside `:root`. A custom
                  property is substituted at computed-value time ON THE ELEMENT THAT DECLARES IT, so
                  `--color-action` resolves against :root's `--action` and what inherits down is the
                  finished colour — this button's own `--action`, set by the [data-accent] block, is
                  never consulted, and every swatch paints the CURRENT accent instead of its own.
                  Reading the raw token resolves here, where the override actually lives.

                  Not colour alone: the chosen palette carries a tick and a ring, so the selection
                  survives greyscale and colour blindness. */}
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: 'var(--action)',
                  outline: active ? '2px solid var(--color-text)' : 'none',
                  outlineOffset: '2px',
                }}
              >
                {active ? (
                  <svg viewBox="0 0 16 16" className="h-4 w-4" style={{ fill: 'var(--on-action)' }}>
                    <path d="M6.2 11.8 2.9 8.5l1.1-1.1 2.2 2.2 5.8-5.8 1.1 1.1z" />
                  </svg>
                ) : null}
              </span>
              {/* Named, not just shown: plum and rose sit 40 degrees apart, and telling them apart
                  by a 28px dot alone is a memory test rather than a choice. */}
              <span
                className="text-xs"
                style={{
                  color: active ? 'var(--color-text)' : 'var(--color-muted)',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {ACCENT_LABELS[value]}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
