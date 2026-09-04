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

// themeColor lives on viewport, not metadata (Next 16). One entry per theme, each matching that
// theme's --color-bg, so the standalone chrome (status bar / task switcher) blends into the phone
// frame instead of sitting in the opposite theme. The dark value also corrects a stale one: it read
// #101114 while --color-bg has been #0c0f16 since the ledger-ink palette landed.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0f16' },
  ],
};

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
        {/* No-FOUC: apply the saved appearance before the app paints. Reads the localStorage cache
            (written by useFontScale and useTheme) and sets the root font-size and the two theme
            attributes, so the app never flashes default → preferred. Most visible on the installed
            PWA, where the splash hands straight over to a painted page.

            A missing or invalid value stamps NOTHING, which is the correct default in all three
            cases: no font-size override, `color-scheme: light dark` left to follow the OS, and the
            bare :root accent palette.

            This is a pre-hydration inline script, so it CANNOT import a module — the percent map,
            the accent list and both storage keys are inlined here and mirror FONT_SCALE_PCT /
            FONT_SCALE_STORAGE_KEY in features/settings/queries.ts and ACCENTS / THEME_STORAGE_KEY /
            ACCENT_STORAGE_KEY in features/settings/theme.ts. theme.test.ts pins the keys on that
            side; keep the lists in sync if the presets ever change.

            The accent is validated against a literal list rather than trusted, because it is
            interpolated into an attribute that CSS then selects on — a junk key would otherwise
            stamp junk onto <html>. dangerouslySetInnerHTML is safe here: the string is a hardcoded
            compile-time constant with no interpolation, so no user or DB value reaches it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var d=document.documentElement;' +
              "var m={sm:'87.5%',md:'100%',lg:'112.5%',xl:'125%'};" +
              "var s=m[localStorage.getItem('moniflow_font_scale')];" +
              'if(s)d.style.fontSize=s;' +
              "var t=localStorage.getItem('moniflow_theme');" +
              "if(t==='light'||t==='dark')d.dataset.theme=t;" +
              "var a=localStorage.getItem('moniflow_accent');" +
              "if(a&&a!=='ink'&&['indigo','violet','plum','rose','clay','olive','teal','azure'].indexOf(a)>-1)" +
              'd.dataset.accent=a;' +
              '}catch(e){}',
          }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
