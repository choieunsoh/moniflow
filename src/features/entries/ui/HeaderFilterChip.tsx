'use client';

import Link from 'next/link';

// A filter chip for a section header (Records, by category or by account) and for the Analytics
// header. It takes the `label` it filters on rather than naming an axis, so both of Records'
// groupings and Analytics' category filter can share it.
//
// On Records it lives inside a collapsible <summary>, so stopPropagation keeps the tap from also
// toggling the section open/closed — the same trick CategoryEditTrigger uses for the header's edit
// icon. Analytics has no <summary>, where the handler is simply a no-op. It's a client component
// only because a Server Component can't attach the onClick handler.
//
// `.tap` because this is the only visible way out of an active filter, and the chip's own padding
// leaves it 22px tall — half the 44px every touch target in this app clears. Do not "fix" that on
// `.chip` itself: four of its six usages are decorative spans that must stay small.
//
// `min-w-0` is needed HERE as well as on the caller's wrapper: this is itself a flex item, and a
// flex item's default min-width:auto floors at its content's min-content width — which the nowrap
// `truncate` span below inflates to the full untruncated label. Without it the chip refuses to
// shrink and a long category name pushes it past the panel edge instead of truncating.
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
      className="chip tap min-w-0 gap-1 transition-opacity active:opacity-70"
      style={
        active
          ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)' }
          : undefined
      }
    >
      <span className="truncate">{label}</span>
      {/* Active means "tap to clear", which the aria-label already says. The × says it to everyone
          else — without it the chip reads as a label, not a control. Inactive it would be a lie:
          on Records an inactive chip APPLIES a filter. */}
      {active ? <span aria-hidden>×</span> : null}
    </Link>
  );
}
