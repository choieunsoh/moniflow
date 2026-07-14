import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { AppShell } from '@shared/ui/AppShell';

// One app-wide typeface: IBM Plex Sans carries UI, prose, and figures alike (numbers just add
// tabular-nums via .tnum). Self-hosted & subset by next/font — no external request, no layout
// shift. Deliberately no monospace for numbers: Plex Sans has a plain zero, whereas a mono
// (IBM Plex Mono, Consolas…) reintroduces the slashed/dotted zero we don't want.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Moniflow — money, quietly in view',
  description:
    'A calm, private way to watch your money flow — every baht in view, and it never leaves your device.',
  manifest: '/manifest.webmanifest',
  // Home-screen launch on iOS: chromeless, dark status bar, "Moniflow" under the icon.
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Moniflow' },
};

// themeColor lives on viewport, not metadata (Next 16). Matches the app's --color-bg so the
// standalone chrome (status bar / task switcher) blends into the phone frame.
export const viewport: Viewport = { themeColor: '#101114' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the pre-paint inline script below sets html style.fontSize before
    // React hydrates, so the client <html> intentionally differs from the server HTML. This suppresses
    // only THIS element's own attribute mismatch (one level deep), not the tree below — the standard
    // no-FOUC pattern (same reason next-themes suppresses it for its theme attribute).
    <html lang="en" className={plexSans.variable} suppressHydrationWarning>
      {/* The whole app is a centered fixed-width phone frame (mobile-only; desktop = same size).
          AppShell is a client component: the header search-suggestion pool + icon set are
          DB-derived and now read via the browser OPFS db, which only exists client-side. */}
      <body className="min-h-dvh">
        {/* No-FOUC: apply the saved text scale before the app paints. Reads the localStorage cache
            (written by useFontScale) and sets the root font-size, so the rem-based UI never flashes
            from default → preferred size on load. Missing/invalid → browser default (md). This is a
            pre-hydration inline script (standard next-themes pattern), so it CANNOT import a module —
            the percent map and key are inlined here and mirror FONT_SCALE_PCT / FONT_SCALE_STORAGE_KEY
            in features/settings/queries.ts (keep the two in sync if the presets ever change).
            dangerouslySetInnerHTML is safe here: the string is a hardcoded compile-time constant with
            no interpolation — no user/DB value reaches it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m={sm:'87.5%',md:'100%',lg:'112.5%',xl:'125%'};" +
              "var s=m[localStorage.getItem('moniflow_font_scale')];" +
              'if(s)document.documentElement.style.fontSize=s;}catch(e){}',
          }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
