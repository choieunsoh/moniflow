'use client';

import { type ReactNode, Suspense } from 'react';
import { useSearchSuggestions } from '@features/entries/use-search-suggestions';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import { AppHeader } from './AppHeader';
import { SearchBox } from '@features/entries/ui/SearchBox';
import { BottomBar } from './BottomBar';
import { ToastRegion } from './ToastRegion';
import { ServiceWorkerRegistrar } from './ServiceWorkerRegistrar';

// Client shell for the whole app's chrome — the header search-suggestion pool and icon set are
// DB-derived and now come from the browser OPFS db (useSearchSuggestions), so this can't stay in
// the (Server Component) root layout. Renders the same phone-frame chrome the layout used to render
// inline. While !ready, still renders the full frame with an empty suggestion pool and the default
// icon set — first paint is never blank, the search pool just fills in a tick later.
export function AppShell({ children }: { children: ReactNode }) {
  // Defaults ([] / 'emoji') from the hook already cover the !ready frame, so `ready` itself isn't
  // read here — the frame renders immediately either way and the pool fills in a tick later.
  const { suggestions, iconSet } = useSearchSuggestions();

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
          {/* pb clears the fixed bottom bar (bar height + FAB overhang + safe area). */}
          <main className="flex-1 pb-24">{children}</main>
        </div>
        <BottomBar />
      </Suspense>
      <ToastRegion />
      <ServiceWorkerRegistrar />
    </CategoryPickerProvider>
  );
}
