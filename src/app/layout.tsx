import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctCategories, getDistinctAccounts } from '@features/entries/queries';
import { ensureSettingsTable } from '@features/settings/schema';
import { getIconSet } from '@features/settings/queries';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import { AppHeader } from '@shared/ui/AppHeader';
import { SearchBox } from '@features/entries/ui/SearchBox';
import { BottomBar } from '@shared/ui/BottomBar';
import { ToastRegion } from '@shared/ui/ToastRegion';

// The header search reads SQLite (autocomplete pool), and better-sqlite3 can't be prerendered.
export const dynamic = 'force-dynamic';

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
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Autocomplete pool for the header search: distinct categories + accounts, de-duped and sorted.
  const db = initDb();
  ensureEntriesTable(db);
  ensureSettingsTable(db);
  const suggestions = [
    ...new Set([...getDistinctCategories(db), ...getDistinctAccounts(db)]),
  ].sort();
  const iconSet = getIconSet(db);

  return (
    <html lang="en" className={plexSans.variable}>
      <body className="min-h-dvh">
        {/* The whole app is a centered fixed-width phone frame (mobile-only; desktop = same size). */}
        {/* One app-wide category picker: any CategoryIconButton/CategoryEditTrigger on any page taps
            into this single shared dialog, so category icons are editable everywhere. */}
        <CategoryPickerProvider iconSet={iconSet}>
          <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[var(--app-max-width)] flex-col">
            <AppHeader search={<SearchBox suggestions={suggestions} />} />
            {/* pb clears the fixed bottom bar (bar height + FAB overhang + safe area). */}
            <main className="flex-1 pb-24">{children}</main>
          </div>
          <BottomBar />
          <ToastRegion />
        </CategoryPickerProvider>
      </body>
    </html>
  );
}
