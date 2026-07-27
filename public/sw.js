// Minimal service worker for Moniflow. Its only jobs: make the app installable (Chrome requires a
// fetch handler + manifest) and give offline fallback. Network-first so a launch always shows the
// latest figures from the server; cache fallback so the home-screen app still opens something when
// offline. Runtime cache only — no precache list to go stale.
// ponytail: no push/notification handlers — Moniflow has no push backend. Add them (VAPID + server
// send) only if daily-summary pushes are ever wanted.
//
// __BUILD__ is substituted with the release version by scripts/stamp-sw.ts, as a postbuild step on
// out/ only. That substitution is load-bearing, not cosmetic: a browser installs a new worker only
// when this file's BYTES differ, and while this file was a fixed string every deploy shipped an
// identical worker, so an installed PWA never saw an update and ran a bundle several releases old.
// The version rides in the cache name so a new release also starts from a clean cache.
const CACHE = 'moniflow-__BUILD__';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      // Drop every previous release's cache. Without this each release would leave its own copy of
      // the app behind for good, growing this origin's storage forever — which on an origin whose
      // OPFS holds the only copy of the ledger is pressure worth not inviting.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache what is actually servable. Storing a 404 or a 5xx meant the offline fallback
        // could later hand back a cached failure as though it were the page.
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      // A miss resolves to undefined, which respondWith turns into a network error — the same thing
      // the browser would have shown anyway, so there is nothing better to fall back to.
      .catch(() => caches.match(event.request)),
  );
});
