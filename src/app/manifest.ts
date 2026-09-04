import type { MetadataRoute } from 'next';

// Rendered once at build time — required under `output: 'export'` (no server to generate it per-request).
export const dynamic = 'force-static';

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
    // The install splash, and the only colours here that cannot follow the theme: a manifest has no
    // prefers-color-scheme, so these are single values while layout.tsx's themeColor carries a pair.
    // Both stay on the DARK ground, which is the app's default and its first-run appearance.
    // They read #101114 until this branch, which has not been --color-bg since the ledger-ink
    // palette landed — the same stale value layout.tsx carried.
    background_color: '#0c0f16',
    theme_color: '#0c0f16',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
