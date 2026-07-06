import Link from 'next/link';
import { cycleFromKey, stepKey } from '../cycle';

// Prev / current / next cycle navigation. Pure links that swap the ?cycle= param and re-render the
// server component — no client state. The center shows the active cycle's range label.
export function CycleSelector({ activeKey }: { activeKey: string }) {
  const active = cycleFromKey(activeKey);
  const prev = stepKey(activeKey, -1);
  const next = stepKey(activeKey, 1);
  return (
    <nav className="panel flex items-center justify-between p-3">
      <Link href={`?cycle=${prev}`} className="rounded px-3 py-1 text-sm hover:underline">
        ← {cycleFromKey(prev).label}
      </Link>
      <span className="text-sm font-semibold">{active.label}</span>
      <Link href={`?cycle=${next}`} className="rounded px-3 py-1 text-sm hover:underline">
        {cycleFromKey(next).label} →
      </Link>
    </nav>
  );
}
