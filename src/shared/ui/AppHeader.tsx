import Link from 'next/link';
import { Wordmark } from './Wordmark';

// Mobile app header: just the wordmark (nav now lives in the bottom bar). Sticky, blurred, and
// constrained to the app column by its parent in layout.tsx.
export function AppHeader() {
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
      <div className="flex h-14 items-center px-4">
        <Link href="/" className="tap rounded-[var(--radius-sm)]" aria-label="moniflow home">
          <Wordmark />
        </Link>
      </div>
    </header>
  );
}
