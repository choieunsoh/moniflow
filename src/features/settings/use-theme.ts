'use client';

import { useEffect } from 'react';
import { withDb } from '@shared/db-effect';
import { getAccent, getTheme } from './queries';
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type Accent,
  type Theme,
} from './theme';
import { useDataVersion } from '@shared/data-version';

// Single writer of the app-wide appearance. Reads both axes from OPFS, stamps <html>, and refreshes
// the localStorage cache the pre-paint inline script (layout.tsx) reads on the next load. Re-runs on
// every data-version bump, so picking a theme in Settings persists live — and reconciles the cache
// if it ever drifts from OPFS (localStorage cleared but OPFS kept, or the reverse). Called once, in
// AppShell, beside useFontScale.
//
// A default choice REMOVES its attribute rather than stamping one. That is the whole reason the
// default cannot drift: 'system' leaves `color-scheme: light dark` in charge, so an OS switch is
// followed live with no JS, and 'ink' leaves the bare :root palette in play.
export function useTheme(): void {
  const version = useDataVersion();

  useEffect(() => {
    void withDb(async (db) => {
      const [theme, accent] = await Promise.all([getTheme(db), getAccent(db)]);
      applyTheme(theme);
      applyAccent(accent);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    });
  }, [version]);
}

// Exported so the pickers can stamp optimistically on click without waiting for a write to OPFS and
// a data-version bump to come back around. The hook remains the only writer of the CACHE.
export function applyTheme(theme: Theme): void {
  if (theme === DEFAULT_THEME) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

export function applyAccent(accent: Accent): void {
  if (accent === DEFAULT_ACCENT) delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = accent;
}
