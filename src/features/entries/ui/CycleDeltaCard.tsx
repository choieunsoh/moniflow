import type { CycleDelta } from '../dashboard';
import { formatBahtWhole } from '@shared/money';

// "This cycle vs last" — moved off the /dashboard screen onto Trends, where a cross-cycle comparison
// belongs. delta === null → no comparable earlier cycle. up = spending more (loss red), down = less.
export function CycleDeltaCard({ delta }: { delta: CycleDelta | null }) {
  if (delta === null) {
    return (
      <section className="panel flex flex-col gap-2 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          This cycle vs last
        </h2>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No comparable earlier cycle yet
        </span>
      </section>
    );
  }
  if (delta.direction === 'same') {
    return (
      <section className="panel flex flex-col gap-2 p-5">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          This cycle vs last
        </h2>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Same as last cycle
        </span>
      </section>
    );
  }
  const up = delta.direction === 'up';
  const color = up ? 'var(--color-loss)' : 'var(--color-accent-text)';
  return (
    <section className="panel flex flex-col gap-2 p-5">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
        This cycle vs last
      </h2>
      <span className="tnum text-2xl font-semibold" style={{ color }}>
        {up ? '↑' : '↓'} {formatBahtWhole(Math.abs(delta.delta))}
      </span>
      <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {up ? 'more than' : 'less than'} last cycle ({formatBahtWhole(delta.prevTotal)})
      </span>
    </section>
  );
}
