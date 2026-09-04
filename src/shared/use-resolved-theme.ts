'use client';

import { useSyncExternalStore } from 'react';

// The theme actually in effect — which is NOT the same as the user's preference. 'system' resolves
// through the OS, and the OS can change while the app is open.
//
// This exists for canvas. A canvas cannot use CSS variables, so the ECharts wrappers read tokens
// with getComputedStyle and BAKE the values into an option object. That snapshot goes stale the
// moment the resolved theme changes without a React update — which is exactly what an OS switch
// under 'system' does: `color-scheme: light dark` moves every CSS colour live, deliberately with no
// JS, and therefore bumps nothing a chart's effect is watching. The result was a chart still drawn
// in the old theme's ink, on a card that had already repainted around it.
//
// Depending on this hook puts those effects back in sync. Everything else in the app is plain CSS
// and needs no such help.
const QUERY = '(prefers-color-scheme: dark)';

export type ResolvedTheme = 'light' | 'dark';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  // data-theme overrides the OS, and both the pre-paint script and the picker set it directly on
  // <html> rather than through React — so an attribute observer is the only way to see it move.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ['data-theme'] });
  return () => {
    media.removeEventListener('change', onChange);
    observer.disconnect();
  };
}

function getSnapshot(): ResolvedTheme {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia(QUERY).matches ? 'dark' : 'light';
}

// Prerendered in Node by `output: 'export'`, where there is no window. The app is dark-first and the
// pre-paint script corrects <html> before anything renders, so dark is the honest server answer.
function getServerSnapshot(): ResolvedTheme {
  return 'dark';
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
