import type { ReactNode } from 'react';
import Link from 'next/link';
import { Wordmark } from './Wordmark';

// Mobile app header: the wordmark (home link) plus an optional `search` slot. Sticky, blurred, and
// constrained to the app column by its parent in layout.tsx. The slot keeps this shell
// feature-agnostic — layout (in app/) wires the entries SearchBox in, so shared/ never imports a
// feature. The dropdown that the slot renders escapes the header because nothing here clips overflow.
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
      <div className="flex h-[var(--header-h)] items-center gap-3 px-4">
        <Link
          href="/"
          className="tap shrink-0 rounded-[var(--radius-sm)]"
          aria-label="moniflow home"
        >
          <Wordmark />
        </Link>
        {search && <div className="min-w-0 flex-1">{search}</div>}
      </div>
    </header>
  );
}
