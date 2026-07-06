import type { Progress } from '../cycle';

// Calendar position within the cycle — "Day 12 of 31" with a thin track. Not a budget gauge (that
// arrives with the budgets slice); this just anchors how far through the cycle you are.
export function CycleProgress({ progress }: { progress: Progress }) {
  const pct = (progress.day / progress.total) * 100;
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex justify-between text-sm" style={{ color: 'var(--color-muted)' }}>
        <span>Cycle progress</span>
        <span className="tnum">
          Day {progress.day} of {progress.total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded" style={{ background: 'var(--color-border)' }}>
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, background: 'var(--color-accent)' }}
        />
      </div>
    </div>
  );
}
