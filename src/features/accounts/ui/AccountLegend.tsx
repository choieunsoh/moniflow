import { formatBaht } from '@shared/money';
import { TailDisclosure } from '@shared/ui/TailDisclosure';
import { MAX_SLICES } from '@features/entries/donut';
import type { Bar } from '@features/entries/breakdown';

// The ranked legend under the accounts donut.
//
// It folds at MAX_SLICES for the reason stated beside that constant: the ring and the list are one
// dataset rendered twice, so a list naming 20 accounts under a ring naming 7 + Other was changing
// the answer rather than the visualisation. Unlike the ring, the list keeps its tail as real rows
// behind a disclosure instead of an inert "Other" — nothing here is dropped for being long.
export function AccountLegend({ bars }: { bars: Bar[] }) {
  // An account whose refunds exceed its spend has nothing to show — the donut above already drops it
  // (toDonutSlices filters value > 0), so the list must fold at the same point or the two disagree
  // about which accounts had spending.
  const spending = bars.filter((b) => b.pct > 0);
  const lead = spending.slice(0, MAX_SLICES);
  const tail = spending.slice(MAX_SLICES);

  const row = (b: Bar) => (
    <li key={b.key} className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm">{b.key}</span>
      <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
        {/* Same filter logic as Breakdown.tsx: pct > 0 ensures total < 0, so -b.total is always positive. */}
        {formatBaht(-b.total)}
      </span>
    </li>
  );

  return (
    <>
      <ul className="flex flex-col gap-2">{lead.map(row)}</ul>
      <TailDisclosure count={tail.length} singular="account" plural="accounts">
        <ul className="mt-3 flex flex-col gap-2">{tail.map(row)}</ul>
      </TailDisclosure>
    </>
  );
}
