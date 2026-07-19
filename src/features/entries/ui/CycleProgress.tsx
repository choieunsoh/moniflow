import type { Progress } from '../cycle';

// A thin time-elapsed bar for the current billing cycle — how far through the cutoff-to-cutoff month
// we are, shown under the cycle header. `day`/`total` come from cycleProgress; the caller renders it
// only for the current cycle (a past cycle's permanently-full bar is noise). This is TIME, not spend,
// so it stays neutral (muted) — deliberately not the accent/warn/loss the budget meters use, so it
// reads as calm context and never competes with the spend meters below it.
// `className` lets the caller fold this into its own column rhythm — on Home it belongs to the band
// of cycle chrome above the data, not to the 24px page gaps between sections.
export function CycleProgress({
  progress,
  className = '',
}: {
  progress: Progress;
  className?: string;
}) {
  const pct = (progress.day / progress.total) * 100;
  return (
    <div className={`flex items-center gap-2 px-1 ${className}`}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded"
        style={{ background: 'var(--color-border)' }}
      >
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, background: 'var(--color-muted)' }}
        />
      </div>
      <span className="tnum shrink-0 text-xs" style={{ color: 'var(--color-muted)' }}>
        Day {progress.day} of {progress.total}
      </span>
    </div>
  );
}
