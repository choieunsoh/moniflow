import Link from 'next/link';
import { cycleFromKey, stepKey } from '../cycle';

// Prev / current / next cycle navigation. Pure links that swap the ?cycle= param and re-render the
// server component — no client state. Mobile-only: the prev/next controls are chevron icon buttons
// (44px tap targets) with the active cycle label centered; the neighbouring cycle's date range is
// carried only in the aria-label for screen readers, not shown, to keep the row clean.
// `cutoff` is required so the aria labels match whatever the caller resolved from settings.
export function CycleSelector({ activeKey, cutoff }: { activeKey: string; cutoff: number }) {
  const active = cycleFromKey(activeKey, cutoff);
  const prev = stepKey(activeKey, -1);
  const next = stepKey(activeKey, 1);
  const prevLabel = cycleFromKey(prev, cutoff).label;
  const nextLabel = cycleFromKey(next, cutoff).label;
  return (
    <nav className="panel flex items-center justify-between p-2">
      <Link
        href={`?cycle=${prev}`}
        aria-label={`Previous cycle: ${prevLabel}`}
        className="grid size-11 place-items-center rounded-[var(--radius-md)] transition-colors duration-150 active:bg-[var(--color-surface-2)]"
        style={{ color: 'var(--color-muted)' }}
      >
        <ChevronLeft />
      </Link>
      <span className="text-sm font-semibold">{active.label}</span>
      <Link
        href={`?cycle=${next}`}
        aria-label={`Next cycle: ${nextLabel}`}
        className="grid size-11 place-items-center rounded-[var(--radius-md)] transition-colors duration-150 active:bg-[var(--color-surface-2)]"
        style={{ color: 'var(--color-muted)' }}
      >
        <ChevronRight />
      </Link>
    </nav>
  );
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10 3 5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
