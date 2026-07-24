import type { Anomaly } from '../anomaly';

const MAX_SHOWN = 2;
const ratioFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

// "This category is unusually high for you" — the worst one or two categories whose anchor-cycle
// spend stands out against their own norm (see anomalies()). Renders nothing when there's nothing to
// warn about, so it never occupies space on a normal cycle. Text carries the signal (category + '×
// your usual'); the warn colour is decoration, not the only cue.
export function AnomalyBanner({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <section
      className="panel flex flex-col gap-1.5 p-4"
      style={{ borderColor: 'var(--color-loss)' }}
      aria-label="Spending above your usual"
    >
      {anomalies.slice(0, MAX_SHOWN).map((a) => (
        <span key={a.category} className="text-sm">
          <span aria-hidden="true">⚠️ </span>
          <span className="font-semibold">{a.category}</span>{' '}
          <span className="tnum" style={{ color: 'var(--color-loss)' }}>
            {ratioFmt.format(a.ratio)}×
          </span>{' '}
          <span style={{ color: 'var(--color-muted)' }}>your usual</span>
        </span>
      ))}
    </section>
  );
}
