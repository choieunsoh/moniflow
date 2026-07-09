'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { isActivePath } from './active-path';
import { MoreSheet } from './MoreSheet';

// App-style tab bar, always visible, centered to the app column. Five slots:
// Home · Records · [＋ expense FAB → /entries/new] · Budgets · More. Expense-only: the center FAB is
// the single "add expense" action. z-index matches the header; the More sheet is top-layer above it.
export function BottomBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-1/2 w-full max-w-[var(--app-max-width)] -translate-x-1/2 border-t backdrop-blur-md"
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
            href="/records"
            label="Records"
            active={isActivePath(pathname, '/records')}
            icon={<RecordsIcon />}
          />
          <li className="flex justify-center">
            <Link
              href="/entries/new"
              aria-label="Add expense"
              className="-mt-5 grid size-14 place-items-center rounded-full shadow-[var(--shadow-2)]"
              style={{ background: 'var(--color-accent)', color: 'var(--color-on-accent)' }}
            >
              <PlusIcon />
            </Link>
          </li>
          <BarLink
            href="/budgets"
            label="Budgets"
            active={isActivePath(pathname, '/budgets')}
            icon={<BudgetsIcon />}
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

function RecordsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 2.5h10v11l-2-1.2-1.5 1.2L8 12.3 6.5 13.5 5 12.3 3 13.5z M5.5 5.5h5 M5.5 8h5"
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
