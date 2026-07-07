import Link from 'next/link';
import { Wordmark } from './Wordmark';
import { Nav } from './Nav';

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
      <div className="mx-auto flex max-w-[1120px] flex-col gap-1 px-4 pb-2 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:pb-0">
        <Link
          href="/"
          className="tap self-start rounded-[var(--radius-sm)] sm:self-auto"
          aria-label="moniflow home"
        >
          <Wordmark />
        </Link>
        <Nav />
      </div>
    </header>
  );
}
