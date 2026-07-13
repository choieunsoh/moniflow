import type { MetadataRoute } from 'next';

// Next serves this at /manifest.webmanifest (linked automatically via metadata.manifest below).
// standalone + portrait + matching theme/background make the home-screen launch open chromeless,
// phone-shaped, and dark — same frame the app already renders as.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Moniflow',
    short_name: 'Moniflow',
    description: 'A calm, private way to watch your money flow.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#101114',
    theme_color: '#101114',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
