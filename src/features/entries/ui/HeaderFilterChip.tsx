'use client';

import Link from 'next/link';

// A Records section-header chip that filters the ledger to that section (or clears it when already
// active). The by-category and by-account groupings both want it and differ only in which axis they
// filter, so the chip takes the `label` it filters on rather than naming one of them.
//
// It lives inside a collapsible <summary>, so stopPropagation keeps the tap from also toggling the
// section open/closed — the same trick CategoryEditTrigger uses for the header's edit icon. It's a
// client component only because a Server Component can't attach the onClick handler.
export function HeaderFilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={active ? `Clear ${label} filter` : `Filter by ${label}`}
      className="chip truncate transition-opacity active:opacity-70"
      style={
        active
          ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)' }
          : undefined
      }
    >
      {label}
    </Link>
  );
}
