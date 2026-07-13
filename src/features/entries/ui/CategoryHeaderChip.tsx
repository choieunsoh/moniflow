'use client';

import Link from 'next/link';

// The by-category section header lives inside a collapsible <summary>. This chip filters the records
// to its category (or clears it when already active), while stopPropagation keeps the tap from also
// toggling the <summary> — the same trick CategoryEditTrigger uses for the header's edit icon. It's a
// client component only because a Server Component can't attach the onClick handler.
export function CategoryHeaderChip({
  href,
  active,
  category,
}: {
  href: string;
  active: boolean;
  category: string;
}) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      aria-label={active ? `Clear ${category} filter` : `Filter by ${category}`}
      className="chip truncate transition-opacity active:opacity-70"
      style={
        active
          ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)' }
          : undefined
      }
    >
      {category}
    </Link>
  );
}
