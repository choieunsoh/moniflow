'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { isActivePath } from './active-path';
import { MoreSheet } from './MoreSheet';

// App-style tab bar, always visible, centered to the app column. Five slots:
// Home · Records · [＋ expense FAB → /entries/new] · Budgets · More.
// The active tab carries THREE signals — an accent pill behind the icon, accent color, and a heavier
// label — so the current section is unmistakable, not color alone (per the bottom-nav a11y guidance).
// Icons are a consistent 24px outline set; the pill animates and presses for tactile feedback.
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
          background: 'color-mix(in oklab, var(--color-bg) 85%, transparent)',
          borderColor: 'var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -10px 30px -22px rgba(0, 0, 0, 0.85)',
        }}
      >
        <ul className="grid grid-cols-5 items-end">
          <BarTab href="/" label="Home" active={isActivePath(pathname, '/')} icon={<HomeIcon />} />
          <BarTab
            href="/records"
            label="Records"
            active={isActivePath(pathname, '/records')}
            icon={<RecordsIcon />}
          />
          {/* Spacer: the FAB floats over this column (absolutely positioned below). */}
          <li aria-hidden className="h-0" />
          <BarTab
            href="/budgets"
            label="Budgets"
            active={isActivePath(pathname, '/budgets')}
            icon={<BudgetsIcon />}
          />
          <li>
            <BarButton
              label="More"
              active={moreOpen}
              icon={<MoreIcon />}
              onClick={() => setMoreOpen(true)}
            />
          </li>
        </ul>

        {/* Expense FAB — a large circle centered ON the bar's top edge so it clearly overhangs above
            the bar (half above / half over it), the single primary action. */}
        <Link
          href="/entries/new"
          aria-label="Add expense"
          className="absolute top-0 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/3 place-items-center rounded-full transition-transform duration-200 active:scale-95"
          style={{
            background: 'var(--color-accent)',
            color: 'var(--color-on-accent)',
            boxShadow: '0 10px 24px -6px color-mix(in oklab, var(--color-accent) 55%, transparent)',
          }}
        >
          <PlusIcon size={28} />
        </Link>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}

// Color comes from the parent's `color` (icons use stroke=currentColor), so active/inactive lives in
// one place.
function tabColor(active: boolean): string {
  return active ? 'var(--color-accent-text)' : 'var(--color-muted)';
}

// The shared tab visual: icon in a pill (accent-soft when active) over a label. The pill scales down
// on press for tactile feedback.
function TabInner({ active, icon, label }: { active: boolean; icon: ReactNode; label: string }) {
  return (
    <>
      <span
        className="grid place-items-center rounded-full px-4 py-1 transition-[background-color,transform] duration-200 group-active:scale-90"
        style={{ background: active ? 'var(--color-accent-soft)' : 'transparent' }}
      >
        {icon}
      </span>
      <span
        className="text-[0.625rem] transition-[font-weight] duration-200"
        style={{ fontWeight: active ? 600 : 500 }}
      >
        {label}
      </span>
    </>
  );
}

function BarTab({
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
        className="group flex min-h-[44px] w-full flex-col items-center justify-center gap-1 pt-2 pb-1 transition-colors duration-200"
        style={{ color: tabColor(active) }}
      >
        <TabInner active={active} icon={icon} label={label} />
      </Link>
    </li>
  );
}

function BarButton({
  label,
  active,
  icon,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={active}
      className="group flex min-h-[44px] w-full flex-col items-center justify-center gap-1 pt-2 pb-1 transition-colors duration-200"
      style={{ color: tabColor(active) }}
    >
      <TabInner active={active} icon={icon} label={label} />
    </button>
  );
}

// Inline SVG icons — a consistent 24px outline set (stroke=currentColor inherits each tab's color).
// Simple, familiar glyphs; no icon dependency.
function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3h3.5v3.5H3z M9.5 3H13v3.5H9.5z M3 9.5h3.5V13H3z M9.5 9.5H13V13H9.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3v10 M3 8h10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
