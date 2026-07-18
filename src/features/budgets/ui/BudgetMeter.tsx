import { meterCaption, meterColorVar, type BudgetTotal } from '../budget-status';

// Shared budget progress meter: a bar filled to `pct` in the state color, with a caption on the
// right from `meterCaption` — the fill colour is a state signal, so the caption has to name the same
// state in words or it'd be colour-alone. Renders ONLY the bar + caption;
// the caller renders its own header/label line (category row vs. total) above it. Pure and
// server-renderable — no client state.
//
// The caption rounds (formatBahtWhole): this meter is a home-page glance figure, like the donut hole
// it sits under. "over ฿600" answers how bad, not by exactly how much — the ledger surfaces state
// their satang. Only the home page mounts this (directly and via Breakdown).
//
// `pacePct` (0–100, time elapsed in the cycle) draws a "today" tick on the track: fill left of the
// tick = spending under pace, past it = over pace. Passed only for the current cycle (undefined on a
// past cycle, where a pace mark is meaningless). White with a surface-colored halo so the mark reads
// on any fill colour — accent, warn, loss, or the empty track.
export function BudgetMeter({ status, pacePct }: { status: BudgetTotal; pacePct?: number }) {
  const caption = meterCaption(status);
  const fill = meterColorVar(status.state);
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative h-2 flex-1 overflow-hidden rounded"
        style={{ background: 'var(--color-border)' }}
      >
        <div className="h-full rounded" style={{ width: `${status.pct}%`, background: fill }} />
        {pacePct === undefined ? null : (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full"
            style={{
              left: `${pacePct}%`,
              background: 'var(--color-text)',
              boxShadow: '0 0 0 1px var(--color-surface)',
            }}
          />
        )}
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
