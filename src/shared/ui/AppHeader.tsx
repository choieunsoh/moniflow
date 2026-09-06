import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from './Wordmark';

// The portal target a route uses to put its own contextual action in the header (Home's share
// card). A portal rather than another ReactNode prop because the action needs the route's already-
// loaded data: a prop would have to be threaded through AppShell, which would then have to load the
// cycle a SECOND time just to decide what to pass. The route owns its data and posts the button up
// here; shared/ still imports no feature, which is the whole point of the `search` slot below.
export const HEADER_ACTIONS_ID = 'app-header-actions';

// Mobile app header: the wordmark (home link) plus an optional `search` slot and the route-action
// portal above. Sticky, blurred, and constrained to the app column by its parent in layout.tsx. The
// slot keeps this shell feature-agnostic — layout (in app/) wires the entries SearchBox in, so
// shared/ never imports a feature. The dropdown that the slot renders escapes the header because
// nothing here clips overflow.
export function AppHeader({ search }: { search?: ReactNode }) {
  return (
    <header
      className="sticky top-0 border-b backdrop-blur-md"
      style={{
        zIndex: 'var(--z-header)',
        background: 'color-mix(in oklab, var(--color-bg) 82%, transparent)',
        borderColor: 'var(--color-border)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="flex h-14 items-center gap-3 px-4">
        <Link
          href="/"
          className="tap shrink-0 rounded-[var(--radius-sm)]"
          aria-label="moniflow home"
        >
          <Wordmark />
        </Link>
        {search && (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <div className="min-w-0 flex-1">{search}</div>
            {/* After the search control, not before it: the search slot is flex-1 (it has to be, so
                the expanded input can fill the row), which means it absorbs all the slack in this
                row — an action placed ahead of it ends up pinned against the wordmark rather than
                beside the magnifier. The margins then trade places: SearchBox's collapsed button
                carries a -mr-4 to cancel the row's px-4 and sit flush with the frame edge, so ml-4
                gives that 16px back as the gap between the two icons and -mr-4 here puts the action
                where the magnifier used to be. */}
            <div
              id={HEADER_ACTIONS_ID}
              className="-mr-4 ml-4 flex shrink-0 items-center empty:hidden"
            />
          </div>
        )}
      </div>
    </header>
  );
}
