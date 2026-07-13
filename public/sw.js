// Minimal service worker for Moniflow. Its only jobs: make the app installable (Chrome requires a
// fetch handler + manifest) and give offline fallback. Network-first so a launch always shows the
// latest figures from the server; cache fallback so the home-screen app still opens something when
// offline. Runtime cache only — no precache list to go stale.
// ponytail: no push/notification handlers — Moniflow has no push backend. Add them (VAPID + server
// send) only if daily-summary pushes are ever wanted.
const CACHE = 'moniflow-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
