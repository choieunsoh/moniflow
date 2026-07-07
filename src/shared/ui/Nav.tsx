'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/categories', label: 'Categories' },
  { href: '/trips', label: 'Trips' },
  { href: '/settings', label: 'Settings' },
] as const;

// Primary nav. On mobile it's a full-width horizontally-scrollable tab row — all six items stay
// reachable and one-tap, no hamburger, no clipped overflow; at ≥sm it collapses to the inline row.
// The `-mx-4 px-4` lets the strip bleed to the screen edges on mobile while keeping the first/last
// item clear of the gutter; each item is a 44px (.tap) target.
export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0"
      aria-label="Primary"
    >
      {LINKS.map(({ href, label }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
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
