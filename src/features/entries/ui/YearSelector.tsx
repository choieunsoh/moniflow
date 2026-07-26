import Link from 'next/link';
import { ChevronLeft, ChevronRight } from '@shared/ui/Chevron';

// Prev / next year navigation for the /year recap. Pure links that swap the ?year= param — the
// page's read hook re-runs on it, so there is no client state here.
//
// Unlike CycleSelector this disables BOTH ends: forward, because the live cycle is the newest year
// there is; backward, because the ledger has a first entry and walking past it lands on year after
// year of nothing. A boundary renders as a real `disabled` button rather than a hidden control, so
// a screen-reader user is told the direction exists and is exhausted — hiding it instead leaves the
// row with one arrow and no way to learn that was the edge rather than the design.
//
// Sticky under the AppHeader, in the same shell as CycleSelector and MonthSelector: a stepper is
// this app's primary page control, and one of the three scrolling away while the other two held
// made moving between the surfaces feel like moving between two apps. ponytail: the 3.5rem offset
// is CycleSelector's literal — all three must match, and a --header-h token didn't survive Turbopack.
//
// The page decides where each arrow goes and where it stops, and passes the SAME two hrefs to
// SwipeNav — so the gesture and the arrows can never disagree about what is reachable.
export function YearSelector({
  year,
  prevHref,
  nextHref,
}: {
  year: number;
  // null closes that direction: back at the ledger's first year (or an empty ledger), forward at
  // the year the live cycle belongs to.
  prevHref: string | null;
  nextHref: string | null;
}) {
  return (
    <nav
      className="panel sticky top-[calc(3.5rem_+_env(safe-area-inset-top))] z-[var(--z-header)] flex items-center justify-between p-2"
      aria-label="Year"
    >
      {prevHref !== null ? (
        <Link
          prefetch={false}
          href={prevHref}
          aria-label={`Previous year: ${year - 1}`}
          className="grid size-11 place-items-center rounded-[var(--radius-md)] transition-colors duration-150 active:bg-[var(--color-surface-2)]"
          style={{ color: 'var(--color-muted)' }}
        >
          <ChevronLeft />
        </Link>
      ) : (
        <BoundaryArrow label={`Previous year — none, ${year} is the earliest year on record`}>
          <ChevronLeft />
        </BoundaryArrow>
      )}
      <span className="tnum text-sm font-semibold">{year}</span>
      {nextHref !== null ? (
        <Link
          prefetch={false}
          href={nextHref}
          aria-label={`Next year: ${year + 1}`}
          className="grid size-11 place-items-center rounded-[var(--radius-md)] transition-colors duration-150 active:bg-[var(--color-surface-2)]"
          style={{ color: 'var(--color-muted)' }}
        >
          <ChevronRight />
        </Link>
      ) : (
        <BoundaryArrow label={`Next year — none yet, ${year} is still in progress`}>
          <ChevronRight />
        </BoundaryArrow>
      )}
    </nav>
  );
}

function BoundaryArrow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      aria-label={label}
      className="grid size-11 place-items-center"
      style={{ color: 'var(--color-faint)', opacity: 0.4 }}
    >
      {children}
    </button>
  );
}
