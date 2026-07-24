'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isActivePath } from './active-path';
import { cycleHref } from './cycle-href';
import { MoreSheet } from './MoreSheet';
import { useBackupStatus } from '../use-backup-status';

// App-style tab bar, always visible, centered to the app column. Five slots:
// Home · Records · [＋ expense FAB → /entries/new] · Trends · More.
// The active tab carries THREE signals — an accent pill behind the icon, accent color, and a heavier
// label — so the current section is unmistakable, not color alone (per the bottom-nav a11y guidance).
// Icons are a consistent 24px outline set; the pill animates and presses for tactile feedback.
export function BottomBar() {
  const pathname = usePathname();
  // Carry the selected cycle onto the primary tabs so it stays put when you switch sections (Home
  // ↔ Records ↔ Analytics). The FAB doesn't read a cycle, so it stays bare; Budgets moved into the
  // More sheet but still reads a cycle — see MoreSheet's `cycle: true` flag.
  const cycle = useSearchParams().get('cycle');
  const [moreOpen, setMoreOpen] = useState(false);
  // Settings (and its Backup screen) lives in the More sheet, so an overdue backup rides a dot on the
  // More tab — discoverable without opening the sheet, silent while backups are current.
  const { overdue: backupOverdue } = useBackupStatus();

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
            href={cycleHref('/analytics', cycle)}
            label="Trends"
            active={isActivePath(pathname, '/analytics')}
            icon={<TrendsIcon />}
          />
          <li>
            <BarButton
              label="More"
              active={moreOpen}
              icon={<MoreIcon />}
              alert={backupOverdue}
              onClick={() => setMoreOpen(true)}
            />
          </li>
        </ul>

        {/* Expense FAB — a large circle centered ON the bar's top edge so it clearly overhangs above
            the bar (half above / half over it), the single primary action. */}
        <Link
          href="/entries/new"
          prefetch={false}
          aria-label="Add expense"
          className="absolute top-0 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/5 place-items-center rounded-full transition-transform duration-200 active:scale-95"
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
// on press for tactile feedback. `alert` rides an accent dot on the icon — the accessible-name change
// lives on the button, so the signal is never colour-alone.
function TabInner({
  active,
  icon,
  label,
  alert = false,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  alert?: boolean;
}) {
  return (
    <>
      <span
        className="relative grid place-items-center rounded-full px-4 py-1 transition-[background-color,transform] duration-200 group-active:scale-90"
        style={{ background: active ? 'var(--color-accent-soft)' : 'transparent' }}
      >
        {icon}
        {alert ? (
          <span
            aria-hidden
            className="absolute top-0.5 right-2.5 size-2 rounded-full"
            style={{
              background: 'var(--color-accent)',
              boxShadow: '0 0 0 2px var(--color-bg)',
            }}
          />
        ) : null}
      </span>
      {/* The bar is a fixed 5-column grid, so a scaled-up label has nowhere to grow — at 200% zoom
          the longer labels used to overrun their column and collide with their neighbours. Clamped
          to the column and truncated: the icon and the active pill still identify the tab, and the
          accessible name comes from the link, not this text. */}
      <span
        className="max-w-full truncate px-0.5 text-[0.625rem] transition-[font-weight] duration-200"
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
        prefetch={false}
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
  alert = false,
  onClick,
}: {
  label: string;
  active: boolean;
  icon: ReactNode;
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-expanded={active}
      // The dot's meaning, spoken — so the nudge is a wording change, not colour alone.
      aria-label={alert ? `${label} — backup overdue` : undefined}
      className="group flex min-h-[44px] w-full flex-col items-center justify-center gap-1 pt-2 pb-1 transition-colors duration-200"
      style={{ color: tabColor(active) }}
    >
      <TabInner active={active} icon={icon} label={label} alert={alert} />
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

// Trends = the six-cycle history / "is this normal" surface (was Analytics, in the More sheet).
// Ascending bars read as "spending over time", distinct from Home's rising-line overview glyph.
function TrendsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 13V9 M6.5 13V6 M10 13V8 M13.5 13V4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
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
