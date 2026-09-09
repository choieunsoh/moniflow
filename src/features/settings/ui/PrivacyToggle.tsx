'use client';

import { useEffect, useState } from 'react';
import { PRIVACIES, readPrivacy, type Privacy } from '../theme';
import { applyPrivacy } from '../use-privacy';
import { setPrivacyAction } from '../actions';

const LABELS: Record<Privacy, string> = {
  off: 'Off',
  on: 'On',
};

/**
 * Two states, and "Off" is the default.
 *
 * Modelled on ThemePicker exactly, for the same reason: the stored preference cannot be read during
 * render (it lives in localStorage, and this component is prerendered at build time by
 * `output: 'export'`), so the control renders as "Off" first and corrects in an effect — a one-frame
 * correction to a small control, not a privacy flash, because the PAGE state is already correct
 * before first paint, stamped by the inline script in layout.tsx.
 *
 * <html> is stamped here, on click, rather than waiting for the write to reach OPFS and the
 * data-version bump to re-run usePrivacy — a control whose entire job is to be instant cannot afford
 * that round trip. The hook still owns the localStorage cache; this owns only the current frame.
 *
 * A `group` of toggle buttons, deliberately NOT a `radiogroup`: that pattern promises one tab stop
 * and arrow-key cycling, neither of which is implemented here.
 */
export function PrivacyToggle() {
  const [privacy, setPrivacyState] = useState<Privacy>('off');

  // Read the APPLIED state off <html>, not the localStorage cache of it — see the same note in
  // ThemePicker. Saving bumps the data version, which makes useSettings drop `ready` and this page
  // swap in a placeholder, so every pick REMOUNTS this component; only the attribute survives that.
  // Its absence is meaningful here rather than missing: no data-privacy means "off".
  useEffect(() => {
    void Promise.resolve().then(() => {
      setPrivacyState(readPrivacy(document.documentElement.dataset.privacy ?? null));
    });
  }, []);

  function choose(value: Privacy) {
    setPrivacyState(value);
    applyPrivacy(value);
    void setPrivacyAction(value);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend id="privacy-legend" className="text-sm font-medium">
        Hide amounts
      </legend>
      <div
        role="group"
        aria-labelledby="privacy-legend"
        className="flex gap-1 rounded-[var(--radius-md)] border p-1"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
      >
        {PRIVACIES.map((value) => {
          const active = value === privacy;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(value)}
              className="tap flex-1 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)]"
              style={
                active
                  ? { background: 'var(--color-action)', color: 'var(--color-on-action)' }
                  : { color: 'var(--color-muted)' }
              }
            >
              {LABELS[value]}
            </button>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
        Blurs every figure. Press and hold one to read it.
      </p>
    </fieldset>
  );
}
