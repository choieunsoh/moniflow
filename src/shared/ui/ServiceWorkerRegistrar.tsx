'use client';

import { useEffect } from 'react';

// Registers /sw.js once after hydration — the client half of PWA installability. Renders nothing;
// it exists only for the side effect. Kept out of layout's server component because navigator is
// client-only.
//
// It also owns UPDATING the installed app, which used to be nobody's job. Registering and walking
// away meant a home-screen PWA, which resumes from memory and never re-fetches its document, kept
// running whatever bundle it first installed — three consecutive releases shipped, deployed and
// verified green without ever reaching the phone. Two halves are needed and neither works alone:
// the worker file has to change between releases (scripts/stamp-sw.ts) AND something has to look
// for that change and act on it, which is this.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Whether this page load was already under a worker's control. A FIRST install also fires
    // controllerchange, and reloading on that one would reload every first-ever visit for nothing.
    const hadController = navigator.serviceWorker.controller !== null;
    let reloading = false;

    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      // The new worker has taken over, so the document's JS is now the stale half. Reloading is the
      // only way to pick up the new bundle. It lands within a moment of the app being foregrounded
      // (that is the only time we go looking), so it is effectively part of the launch rather than
      // an interruption.
      // ponytail: an in-progress keypad entry would be lost if an update landed at exactly that
      // moment — swap in a toast with a Reload action if that ever actually bites.
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    let registration: ServiceWorkerRegistration | null = null;
    // Ask the browser to re-fetch /sw.js whenever the app is brought to the foreground. Without this
    // an installed PWA can go a long time between update checks, and the whole point is that opening
    // the app is the moment a fix should land.
    const checkForUpdate = () => {
      if (document.visibilityState !== 'visible') return;
      void registration?.update().catch(() => {});
    };

    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registration = reg;
        checkForUpdate();
      })
      .catch(() => {});

    document.addEventListener('visibilitychange', checkForUpdate);
    return () => {
      document.removeEventListener('visibilitychange', checkForUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
  return null;
}
