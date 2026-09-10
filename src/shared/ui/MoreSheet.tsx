'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Tags,
  Wallet,
  Plane,
  Repeat,
  Settings,
  Target,
  CalendarRange,
  CalendarClock,
  PieChart,
  Info,
  Coins,
  Stethoscope,
} from 'lucide-react';
import { cycleHref } from './cycle-href';

// App-launcher grid for the overflow nav — one icon tile per destination, matching the 2×2 grid glyph
// on the "More" tab that opens this sheet. lucide icons (a dependency since the icon-set feature).
//
// GROUPED BY WHAT YOU CAME FOR, three to a row, and ordered by how often the owner actually opens
// them. Lists leads: Categories, Accounts and Currency are the three most-visited destinations in
// the app, and they fill one row exactly. Review is the "look back" set, Plan the forward-looking
// one, and App the pages you open rarely and deliberately.
//
// Checkup sits in App, not with the lists it superficially resembles. It configures nothing — it
// scans the ledger for duplicate rows and deletes them — but its VISIT CADENCE is Settings',
// not Categories'. It previously sat in a "Set up" group it joined for a layout reason (six tiles
// filled two clean rows), which is not a reason.
//
// Twelve tiles across three columns: Lists and App fill a row each, Review wraps to a row of three
// plus one, Plan is a short row of two. That is why the captions earn their space — under a heading
// a short row or an orphan tile reads as the end of a group, and unlabelled it just reads as a hole.
//
// `cycle: true` marks a destination that READS the selected cycle, so its href carries ?cycle= the
// same way BottomBar's primary tabs do. Budgets is the only one, and it landed here when Analytics
// took its tab slot — without this it would silently drop the cycle on every tap.
const GROUPS = [
  {
    id: 'lists',
    caption: 'Lists',
    links: [
      { href: '/categories', label: 'Categories', Icon: Tags, cycle: false },
      { href: '/accounts', label: 'Accounts', Icon: Wallet, cycle: false },
      { href: '/currency', label: 'Currency', Icon: Coins, cycle: false },
    ],
  },
  {
    id: 'review',
    caption: 'Review',
    links: [
      { href: '/year', label: 'Year', Icon: CalendarRange, cycle: false },
      // cycle: false — /month is keyed by ?month=, a calendar month with no year attached, so a
      // ?cycle= tagging along would be inert noise in the URL.
      { href: '/month', label: 'Month', Icon: CalendarClock, cycle: false },
      // cycle: false — /report is keyed by ?year=/?view=, a window of its own choosing; a ?cycle=
      // tagging along would be inert noise in the URL.
      { href: '/report', label: 'Report', Icon: PieChart, cycle: false },
      { href: '/trips', label: 'Trips', Icon: Plane, cycle: false },
    ],
  },
  {
    id: 'plan',
    caption: 'Plan',
    links: [
      { href: '/budgets', label: 'Budgets', Icon: Target, cycle: true },
      { href: '/recurring', label: 'Recurring', Icon: Repeat, cycle: false },
    ],
  },
  {
    id: 'app',
    caption: 'App',
    links: [
      { href: '/settings', label: 'Settings', Icon: Settings, cycle: false },
      // cycle: false — the scan reads the WHOLE ledger, not a cycle, so a ?cycle= riding along
      // would be inert noise in the URL.
      { href: '/checkup', label: 'Checkup', Icon: Stethoscope, cycle: false },
      { href: '/about', label: 'About', Icon: Info, cycle: false },
    ],
  },
] as const;

// Bottom sheet for the overflow nav. Controlled by BottomBar via `open`; drives the native <dialog>
// imperatively (showModal/close) so we inherit focus-trap, Esc-to-close and the ::backdrop. Clicking
// the backdrop (event target === the dialog element) or a tile closes it.
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cycle = useSearchParams().get('cycle');

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
        <h2 className="px-2 pb-1 text-base font-semibold">More</h2>
        {GROUPS.map(({ id, caption, links }) => (
          <section key={id} aria-labelledby={`more-${id}`}>
            {/* text-sm muted is this app's section-heading style everywhere else (Top categories,
                Biggest purchase). Reusing it puts the caption cleanly between the sheet's 16px
                title and the 12px tile labels without inventing a type step for one component. */}
            <h3
              id={`more-${id}`}
              className="px-2 pt-2 pb-1 text-sm font-semibold"
              style={{ color: 'var(--color-muted)' }}
            >
              {caption}
            </h3>
            <ul className="grid grid-cols-3 gap-1">
              {links.map(({ href, label, Icon, cycle: carriesCycle }) => (
                <li key={href}>
                  <Link
                    href={carriesCycle === true ? cycleHref(href, cycle) : href}
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
                    {/* The longest label is "Categories" — at 12px it fits a 3-column tile at
                        412px, but nothing wider would, so keep new labels to one short word. */}
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                      {label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="px-2 pt-3 text-xs leading-relaxed" style={{ color: 'var(--color-faint)' }}>
          Moniflow · your money, quietly in view. Your data stays on your machine.
        </p>
      </div>
    </dialog>
  );
}
