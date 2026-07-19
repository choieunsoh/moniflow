'use client';

import { type ReactNode, Suspense } from 'react';
import { useFontScale } from '@features/settings/use-font-scale';
import { useSearchSuggestions } from '@features/entries/use-search-suggestions';
import { useRecurringSweep } from '@features/recurring/use-recurring-sweep';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import { AppHeader } from './AppHeader';
import { SearchBox } from '@features/entries/ui/SearchBox';
import { BottomBar } from './BottomBar';
import { ToastRegion } from './ToastRegion';
import { ServiceWorkerRegistrar } from './ServiceWorkerRegistrar';
import { DbUnavailable } from './DbUnavailable';
import { useDbHealth } from '../use-db-health';

// Client shell for the whole app's chrome — the header search-suggestion pool and icon set are
// DB-derived and now come from the browser OPFS db (useSearchSuggestions), so this can't stay in
// the (Server Component) root layout. Renders the same phone-frame chrome the layout used to render
// inline. While !ready, still renders the full frame with an empty suggestion pool and the default
// icon set — first paint is never blank, the search pool just fills in a tick later.
export function AppShell({ children }: { children: ReactNode }) {
  useFontScale();
  // There is no server, so opening the app is the schedule: catch the ledger up on whatever
  // recurring rules came due while it was closed, once per app open.
  useRecurringSweep();
  // Defaults ([] / 'emoji') from the hook already cover the !ready frame, so `ready` itself isn't
  // read here — the frame renders immediately either way and the pool fills in a tick later.
  const { suggestions, iconSet } = useSearchSuggestions();
  // App-wide, because the db is app-wide: without this every page independently waits forever on a
  // db that will never open, each showing its own loading placeholder as though data were coming.
  const { failed: dbFailed, retry: retryDb } = useDbHealth();

  return (
    <CategoryPickerProvider iconSet={iconSet}>
      {/* One Suspense boundary for the whole frame: SearchBox, BottomBar, and every page child read
          useSearchParams, which `output: 'export'` requires to sit under a Suspense boundary. An
          ancestor boundary covers all descendants, so this single wrap satisfies them all. The static
          HTML renders the fallback frame, then hydrates into the live app (all data is client/OPFS). */}
      <Suspense
        fallback={
          <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[var(--app-max-width)] flex-col" />
        }
      >
        <div className="app-frame mx-auto flex min-h-dvh w-full max-w-[var(--app-max-width)] flex-col">
          <AppHeader search={<SearchBox suggestions={suggestions} />} />
          {/* pb clears the fixed bottom bar (bar height + FAB overhang + safe area). The db-failure
              panel REPLACES the page rather than sitting above it: with no database every figure the
              page would draw is missing or stale, so rendering it under a warning would just be a
              second, quieter lie. The chrome stays so the app still reads as itself. */}
          <main className="flex-1 pb-24">
            {dbFailed ? (
              <div className="px-4 pt-6">
                <DbUnavailable onRetry={retryDb} />
              </div>
            ) : (
              children
            )}
          </main>
        </div>
        <BottomBar />
      </Suspense>
      <ToastRegion />
      <ServiceWorkerRegistrar />
    </CategoryPickerProvider>
  );
}
