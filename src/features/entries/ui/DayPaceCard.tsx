import type { DayPace } from '../day-pace';

// How the cycle's finished days went, as three counts. The companion to the two forward cards above
// it: those answer "what can I spend?", this one answers "how have I been doing?" — the same
// allowance, graded backwards.
//
// Counts, not money, on purpose. A baht figure here would be a fourth near-identical ฿ number in a
// column that already carries three, and the answer this card gives is a rhythm ("21 of 26 days I
// stayed inside it"), which reads better as days than as an average.
//
// Renders nothing when dayPace is null — no total budget means no target to grade against, and
// SafeToSpendCard above already makes the single "set a budget" case.
export function DayPaceCard({ pace }: { pace: DayPace | null }) {
  if (pace === null) return null;
  const tiles = [
    { label: 'No spend', value: pace.noSpend, tone: 'var(--color-gain)' },
    { label: 'Under target', value: pace.under, tone: undefined },
    { label: 'Over target', value: pace.over, tone: 'var(--color-loss)' },
  ];
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Days against target">
      {/* The denominator rides on the heading row rather than a line of its own under the tiles.
          It has to be stated somewhere — three counts with nothing to divide by is a rhythm you
          can't read — but it is the least important thing on the card, and the heading row was
          already half empty. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          Days against target
        </h2>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
          <span className="tnum">{pace.days}</span> {pace.days === 1 ? 'day' : 'days'} finished
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-0.5">
            {/* A zero is dimmed rather than coloured: "0" in loss red reads as an alarm when it is
                the best possible outcome for that tile. */}
            <span
              className="tnum text-2xl font-semibold"
              style={{ color: t.value === 0 ? 'var(--color-muted)' : t.tone }}
            >
              {t.value}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
