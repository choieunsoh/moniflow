'use client';

import { useEffect, useState } from 'react';
import { readTheme, THEMES, THEME_STORAGE_KEY, type Theme } from '../theme';
import { applyTheme } from '../use-theme';
import { setThemeAction } from '../actions';

const LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Three states, and "System" is the default.
 *
 * The stored preference cannot be read during render (it lives in localStorage, and this component
 * is prerendered at build time by `output: 'export'`), so the control renders as "System" first and
 * corrects in an effect. That is a one-frame correction to a small control, not a theme flash — the
 * PAGE theme is already correct before first paint, stamped by the inline script in layout.tsx.
 *
 * Choosing "System" REMOVES the data-theme attribute rather than setting it, so
 * `color-scheme: light dark` (globals.css) takes over and an OS switch is followed live with no JS.
 *
 * <html> is stamped here, on click, rather than waiting for the write to reach OPFS and the
 * data-version bump to re-run useTheme — a control whose entire job is to be instant cannot afford
 * that round trip. The hook still owns the localStorage cache; this owns only the current frame.
 *
 * A `group` of toggle buttons, deliberately NOT a `radiogroup`: that pattern promises one tab stop
 * and arrow-key cycling, neither of which is implemented here. `aria-pressed` states what is
 * actually true rather than making a contract the control does not keep.
 */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    void Promise.resolve().then(() => {
      setTheme(readTheme(localStorage.getItem(THEME_STORAGE_KEY)));
    });
  }, []);

  function choose(value: Theme) {
    setTheme(value);
    applyTheme(value);
    void setThemeAction(value);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend id="theme-legend" className="text-sm font-medium">
        Theme
      </legend>
      <div
        role="group"
        aria-labelledby="theme-legend"
        className="flex gap-1 rounded-[var(--radius-md)] border p-1"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
      >
        {THEMES.map((value) => {
          const active = value === theme;
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
    </fieldset>
  );
}
