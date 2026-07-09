'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isActivePath } from './active-path';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/categories', label: 'Categories' },
  { href: '/trips', label: 'Trips' },
  { href: '/settings', label: 'Settings' },
] as const;

// Desktop primary nav (hidden below sm — the mobile BottomBar replaces it there). Inline row of
// one-tap items; the active item is tinted with the accent-soft chip.
export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
      {LINKS.map(({ href, label }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="tap shrink-0 rounded-[var(--radius-sm)] px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150"
            style={{
              color: active ? 'var(--color-accent-text)' : 'var(--color-muted)',
              background: active ? 'var(--color-accent-soft)' : 'transparent',
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
