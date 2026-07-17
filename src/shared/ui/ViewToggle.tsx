'use client';

import Link from 'next/link';

// The segmented control that switches a page between its views (?view=). Home and Analytics both
// want it and differ only in their hrefs, so it takes the items rather than knowing either page.
export type ViewOption = { label: string; href: string; active: boolean };

export function ViewToggle({ options }: { options: ViewOption[] }) {
  return (
    <div className="panel flex gap-1 p-1">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          prefetch={false}
          aria-current={o.active ? 'page' : undefined}
          className="flex-1 rounded-[var(--radius-md)] py-2 text-center text-sm font-medium transition-colors duration-150"
          style={{
            background: o.active ? 'var(--color-accent-soft)' : 'transparent',
            color: o.active ? 'var(--color-accent-text)' : 'var(--color-muted)',
          }}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
