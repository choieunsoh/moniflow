'use client';

import Link from 'next/link';

// The segmented control that switches a page between its views (?view=). Home and Analytics both
// want it and differ only in their hrefs, so it takes the items rather than knowing either page.
export type ViewOption = { label: string; href: string; active: boolean };

// `className` exists only so a page can adjust the toggle's spacing within its own column rhythm
// (Home groups it with the cycle chrome); the control's internals stay the caller's business.
export function ViewToggle({
  options,
  className = '',
}: {
  options: ViewOption[];
  className?: string;
}) {
  return (
    <div className={`panel flex gap-1 p-1 ${className}`}>
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          prefetch={false}
          // aria-current="true", not "page": these are views of the page you are already on, and
          // "page" made a screen reader announce "current page" on a page the user never left.
          aria-current={o.active ? 'true' : undefined}
          // grid place-items-center + min-h-11 rather than padding: the segment has to clear the
          // 44px touch floor whatever the label's font scale, and py-2 left it at 36px.
          className="grid min-h-11 flex-1 place-items-center rounded-[var(--radius-md)] text-center text-sm font-medium transition-colors duration-150"
          style={{
            background: o.active ? 'var(--color-selected)' : 'transparent',
            color: o.active ? 'var(--color-text)' : 'var(--color-muted)',
          }}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
