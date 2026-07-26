import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@shared/ui/Chevron';
import { monthName } from '../trend';

// Prev / next MONTH navigation for /month. Pure links that swap ?month= — the page's read hook
// re-runs on it, so there is no client state here.
//
// It WRAPS (Dec → Jan) and never disables, unlike CycleSelector and YearSelector. Those step
// through history, which has two ends; this steps through the twelve names of the calendar, which
// has none. Stepping the anchor CYCLE instead was the obvious first design and it is wrong: standing
// on the live cycle there is no "forward", so reaching August would mean navigating backwards to
// last August — the page is about a month, not about a month-in-a-year.
//
// Sticky under the AppHeader like CycleSelector, and for the same reason: the month name IS this
// page's title, so it has to stay legible while the years scroll past. ponytail: the 3.5rem offset
// is CycleSelector's literal — they must match, and a --header-h token didn't survive Turbopack.
export function MonthSelector({
  month,
  // The page owns the URL shape (it also carries ?category=), so this component never builds one.
  hrefFor,
}: {
  month: number;
  hrefFor: (month: number) => string;
}) {
  const prev = month === 1 ? 12 : month - 1;
  const next = month === 12 ? 1 : month + 1;
  return (
    <nav className="panel sticky top-[calc(3.5rem_+_env(safe-area-inset-top))] z-[var(--z-header)] flex items-center justify-between p-2">
      <Link
        prefetch={false}
        href={hrefFor(prev)}
        aria-label={`Previous month: ${monthName(prev)}`}
        className="grid size-11 place-items-center rounded-[var(--radius-md)] transition-colors duration-150 active:bg-[var(--color-surface-2)]"
        style={{ color: 'var(--color-muted)' }}
      >
        <ChevronLeft />
      </Link>
      <span className="text-sm font-semibold">{monthName(month)}</span>
      <Link
        prefetch={false}
        href={hrefFor(next)}
        aria-label={`Next month: ${monthName(next)}`}
        className="grid size-11 place-items-center rounded-[var(--radius-md)] transition-colors duration-150 active:bg-[var(--color-surface-2)]"
        style={{ color: 'var(--color-muted)' }}
      >
        <ChevronRight />
      </Link>
    </nav>
  );
}
