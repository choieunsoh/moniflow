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
      }}
    >
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-5">
        <Link href="/" className="rounded-[var(--radius-sm)]" aria-label="moniflow home">
          <Wordmark />
        </Link>
        <Nav />
      </div>
    </header>
  );
}
