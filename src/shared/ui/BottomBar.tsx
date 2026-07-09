'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { isActivePath } from './active-path';
import { MoreSheet } from './MoreSheet';

// Mobile-only app-style tab bar. Hidden at >=sm (the top Nav takes over on desktop). Five slots:
// Home · Budgets · [＋ raised FAB → /entries/new] · Trips · More. The FAB overhangs the bar's top
// edge and is visibly larger/primary. z-index matches the header; the More sheet is top-layer above it.
export function BottomBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 border-t backdrop-blur-md sm:hidden"
        style={{
          zIndex: 'var(--z-header)',
          background: 'color-mix(in oklab, var(--color-bg) 82%, transparent)',
          borderColor: 'var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <ul className="grid grid-cols-5 items-end">
          <BarLink href="/" label="Home" active={isActivePath(pathname, '/')} icon={<HomeIcon />} />
          <BarLink
            href="/budgets"
            label="Budgets"
            active={isActivePath(pathname, '/budgets')}
            icon={<BudgetsIcon />}
          />
          <li className="flex justify-center">
            <Link
              href="/entries/new"
              aria-label="Add entry"
              className="-mt-5 grid size-14 place-items-center rounded-full shadow-[var(--shadow-2)]"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
            >
              <PlusIcon />
            </Link>
          </li>
          <BarLink
            href="/trips"
            label="Trips"
            active={isActivePath(pathname, '/trips')}
            icon={<TripsIcon />}
          />
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-2"
              style={{ color: 'var(--color-muted)' }}
            >
              <MoreIcon />
              <span className="text-[0.625rem] font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

function BarLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className="flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-2"
        style={{ color: active ? 'var(--color-accent-text)' : 'var(--color-muted)' }}
      >
        {icon}
        <span className="text-[0.625rem] font-medium">{label}</span>
      </Link>
    </li>
  );
}

// Inline SVG icons (stroke=currentColor so each inherits its slot's active/muted color). No icon dep.
function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 7 8 2l6 5v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BudgetsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 5.5h11v7h-11z M2.5 5.5 8 2l5.5 3.5 M10.5 9h1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TripsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5c-2.2 0-4 1.7-4 3.9 0 2.9 4 8.1 4 8.1s4-5.2 4-8.1c0-2.2-1.8-3.9-4-3.9z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="5.4" r="1.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3h3.5v3.5H3z M9.5 3H13v3.5H9.5z M3 9.5h3.5V13H3z M9.5 9.5H13V13H9.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10 M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
