import { formatBaht } from '@shared/money';
import { meterColorVar, type BudgetTotal } from '../budget-status';

// Shared budget progress meter: a bar filled to `pct` in the state color, with a caption on the
// right — "over ฿600" when past the limit, else the percent used. Renders ONLY the bar + caption;
// the caller renders its own header/label line (category row vs. total) above it. Pure and
// server-renderable — no client state.
export function BudgetMeter({ status }: { status: BudgetTotal }) {
  const caption =
    status.state === 'over'
      ? `over ${formatBaht(Math.abs(status.remaining))}`
      : `${Math.round(status.pct)}%`;
  const fill = meterColorVar(status.state);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 flex-1 overflow-hidden rounded"
        style={{ background: 'var(--color-border)' }}
      >
        <div className="h-full rounded" style={{ width: `${status.pct}%`, background: fill }} />
      </div>
      <span
        className="tnum shrink-0 text-xs"
        style={{ color: status.state === 'over' ? fill : 'var(--color-muted)' }}
      >
        {caption}
      </span>
    </div>
  );
}
