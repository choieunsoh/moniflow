'use client';

import { useEffect } from 'react';

// Registers /sw.js once after hydration — the client half of PWA installability. Renders nothing;
// it exists only for the side effect. Kept out of layout's server component because navigator is
// client-only.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
