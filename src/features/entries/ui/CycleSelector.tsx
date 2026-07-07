import Link from 'next/link';
import { cycleFromKey, stepKey } from '../cycle';

// Prev / current / next cycle navigation. Pure links that swap the ?cycle= param and re-render the
// server component — no client state. `cutoff` is required (no default): it must match whatever
// the caller resolved from settings, or the labels here would drift from the rest of the page.
export function CycleSelector({ activeKey, cutoff }: { activeKey: string; cutoff: number }) {
  const active = cycleFromKey(activeKey, cutoff);
  const prev = stepKey(activeKey, -1);
  const next = stepKey(activeKey, 1);
  return (
    <nav className="panel flex items-center justify-between p-3">
      <Link href={`?cycle=${prev}`} className="rounded px-3 py-1 text-sm hover:underline">
        ← {cycleFromKey(prev, cutoff).label}
      </Link>
      <span className="text-sm font-semibold">{active.label}</span>
      <Link href={`?cycle=${next}`} className="rounded px-3 py-1 text-sm hover:underline">
        {cycleFromKey(next, cutoff).label} →
      </Link>
    </nav>
  );
}
