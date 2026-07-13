'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isActivePath } from './active-path';
import { cycleHref } from './cycle-href';
import { MoreSheet } from './MoreSheet';

// App-style tab bar, always visible, centered to the app column. Five slots:
// Home · Records · [＋ expense FAB → /entries/new] · Budgets · More.
// The active tab carries THREE signals — an accent pill behind the icon, accent color, and a heavier
// label — so the current section is unmistakable, not color alone (per the bottom-nav a11y guidance).
// Icons are a consistent 24px outline set; the pill animates and presses for tactile feedback.
export function BottomBar() {
  const pathname = usePathname();
  // Carry the selected cycle onto the primary tabs so it stays put when you switch sections (Home
  // ↔ Records ↔ Budgets). The FAB and the More sheet's links go to pages that don't read a cycle,
  // so they stay bare.
  const cycle = useSearchParams().get('cycle');
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
          <BarTab
            href={cycleHref('/', cycle)}
            label="Home"
            active={isActivePath(pathname, '/')}
            icon={<HomeIcon />}
          />
          <BarTab
            href={cycleHref('/records', cycle)}
            label="Records"
            active={isActivePath(pathname, '/records')}
            icon={<RecordsIcon />}
          />
          {/* Spacer: the FAB floats over this column (absolutely positioned below). */}
          <li aria-hidden className="h-0" />
          <BarTab
            href={cycleHref('/budgets', cycle)}
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
// Home opens the spending overview (the donut + breakdown), so the tab reads as a trend line rather
// than a house — a functional dashboard glyph, deliberately not the 'm' brand mark (that's the
// wordmark's job; a logo-as-nav-tab would say "moniflow" where the user needs "overview").
function HomeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 10.8 6.2 7.1l2.3 2.3 5-5 M11 4.4h2.5v2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Records is the day-by-day list of entries — a bulleted list reads more directly than a receipt.
function RecordsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 4.5h7.5 M6 8h7.5 M6 11.5h7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="3" cy="4.5" r="0.9" fill="currentColor" />
      <circle cx="3" cy="8" r="0.9" fill="currentColor" />
      <circle cx="3" cy="11.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

// Budgets = money set aside per category — a wallet reads as money more clearly than the old bank box.
function BudgetsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.8 5.2a1.2 1.2 0 0 1 1.2-1.2h7a1.2 1.2 0 0 1 1.2 1.2V6 M2.8 5.2v5.6a1.2 1.2 0 0 0 1.2 1.2h8a1.2 1.2 0 0 0 1.2-1.2V7.5a1 1 0 0 0-1-1h-2.4a1.35 1.35 0 0 0 0 2.7H13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10.9" cy="7.85" r="0.55" fill="currentColor" />
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
