import { formatBahtWhole } from '@shared/money';

// A ring cannot draw a negative wedge, so toDonutSlices drops a category whose refunds outweighed
// its spend. Dropping it is right; dropping it SILENTLY is not, because the difference between the
// ring's total and the cycle's net is then money that moved and is named nowhere. This is the one
// line that keeps the ring honest, and it renders only when there is something to disclose.
export function RingFootnote({ refunded, categories }: { refunded: number; categories: string[] }) {
  if (refunded <= 0) return null;
  const named = categories.length > 0 ? ` (${categories.join(', ')})` : '';
  return (
    <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
      {formatBahtWhole(refunded)} refunded{named}, not shown in the ring
    </p>
  );
}
