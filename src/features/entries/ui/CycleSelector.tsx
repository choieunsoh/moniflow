import Link from 'next/link';
import { cycleFromKey, stepKey } from '../cycle';

// Prev / current / next cycle navigation. Pure links that swap the ?cycle= param and re-render the
// server component — no client state. On mobile the prev/next labels collapse to just ← / → (the
// active label stays centered) so three month-ranges don't cram one row; full labels return at ≥sm.
// `cutoff` is required so labels match whatever the caller resolved from settings.
export function CycleSelector({ activeKey, cutoff }: { activeKey: string; cutoff: number }) {
  const active = cycleFromKey(activeKey, cutoff);
  const prev = stepKey(activeKey, -1);
  const next = stepKey(activeKey, 1);
  const prevLabel = cycleFromKey(prev, cutoff).label;
  const nextLabel = cycleFromKey(next, cutoff).label;
  return (
    <nav className="panel flex items-center justify-between gap-2 p-2 sm:p-3">
      <Link
        href={`?cycle=${prev}`}
        aria-label={`Previous cycle: ${prevLabel}`}
        className="tap rounded px-3 text-sm hover:underline"
      >
        <span aria-hidden="true">←</span>
        <span className="hidden sm:inline">&nbsp;{prevLabel}</span>
      </Link>
      <span className="text-sm font-semibold">{active.label}</span>
      <Link
        href={`?cycle=${next}`}
        aria-label={`Next cycle: ${nextLabel}`}
        className="tap rounded px-3 text-sm hover:underline"
      >
        <span className="hidden sm:inline">{nextLabel}&nbsp;</span>
        <span aria-hidden="true">→</span>
      </Link>
    </nav>
  );
}
