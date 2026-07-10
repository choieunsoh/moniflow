import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { AppHeader } from '@shared/ui/AppHeader';
import { BottomBar } from '@shared/ui/BottomBar';

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
  title: 'Moniflow — local-first money-flow dashboard',
  description: 'Track your money flow in a local SQLite file. Calm, precise, yours.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={plexSans.variable}>
      <body className="min-h-dvh">
        {/* The whole app is a centered fixed-width phone frame (mobile-only; desktop = same size). */}
        <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[var(--app-max-width)] flex-col">
          <AppHeader />
          {/* pb clears the fixed bottom bar (bar height + FAB overhang + safe area). */}
          <main className="flex-1 pb-24">{children}</main>
        </div>
        <BottomBar />
      </body>
    </html>
  );
}
