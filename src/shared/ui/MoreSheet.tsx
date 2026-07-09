'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

const LINKS = [
  { href: '/categories', label: 'Categories' },
  { href: '/trips', label: 'Trips' },
  { href: '/settings', label: 'Settings' },
] as const;

// Bottom sheet for the overflow nav. Controlled by BottomBar via `open`; drives the native <dialog>
// imperatively (showModal/close) so we inherit focus-trap, Esc-to-close and the ::backdrop. Clicking
// the backdrop (event target === the dialog element) or a link closes it.
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="more-sheet sm:hidden"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex flex-col gap-1 p-4">
        <span
          aria-hidden
          className="mx-auto mb-3 h-1 w-10 rounded-full"
          style={{ background: 'var(--color-border-strong)' }}
        />
        <h2 className="px-2 pb-1 text-base font-semibold">More</h2>
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            className="tap rounded-[var(--radius-md)] px-2 text-sm font-medium"
            style={{ color: 'var(--color-text)' }}
          >
            {l.label}
          </Link>
        ))}
        <p className="px-2 pt-3 text-xs leading-relaxed" style={{ color: 'var(--color-faint)' }}>
          Moniflow · local-first money flow. Your data stays in a SQLite file on your machine.
        </p>
      </div>
    </dialog>
  );
}
