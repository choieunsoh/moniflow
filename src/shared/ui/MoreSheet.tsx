'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { Tags, Plane, Settings } from 'lucide-react';

// App-launcher grid for the overflow nav — one icon tile per destination, matching the 2×2 grid glyph
// on the "More" tab that opens this sheet. lucide icons (a dependency since the icon-set feature).
const LINKS = [
  { href: '/categories', label: 'Categories', Icon: Tags },
  { href: '/trips', label: 'Trips', Icon: Plane },
  { href: '/settings', label: 'Settings', Icon: Settings },
] as const;

// Bottom sheet for the overflow nav. Controlled by BottomBar via `open`; drives the native <dialog>
// imperatively (showModal/close) so we inherit focus-trap, Esc-to-close and the ::backdrop. Clicking
// the backdrop (event target === the dialog element) or a tile closes it.
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
      className="more-sheet"
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
        <h2 className="px-2 pb-2 text-base font-semibold">More</h2>
        <ul className="grid grid-cols-3 gap-1">
          {LINKS.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={onClose}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] p-3 transition-colors active:opacity-70"
              >
                <span
                  aria-hidden
                  className="grid size-12 place-items-center rounded-[var(--radius-md)]"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                >
                  <Icon size={22} />
                </span>
                <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                  {label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="px-2 pt-3 text-xs leading-relaxed" style={{ color: 'var(--color-faint)' }}>
          Moniflow · local-first money flow. Your data stays in a SQLite file on your machine.
        </p>
      </div>
    </dialog>
  );
}
