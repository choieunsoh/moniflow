'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/categories', label: 'Categories' },
  { href: '/trips', label: 'Trips' },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1" aria-label="Primary">
      {LINKS.map(({ href, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className="rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium transition-colors duration-150"
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
