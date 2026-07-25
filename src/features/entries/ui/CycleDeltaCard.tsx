import type { CycleDelta } from '../dashboard';
import type { DeltaContributor } from '../delta-breakdown';
import type { IconSet } from '@features/settings/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatBahtWhole } from '@shared/money';

// "This cycle vs last" — the headline total (moved off /dashboard onto Trends). When `contributors`
// are supplied (unfiltered only) it also lists the top movers that drove the total: the "what
// changed" answer the bare number can't give. delta === null → no comparable earlier cycle. up =
// spending more (loss red), down = less (accent).
export function CycleDeltaCard({
  delta,
  contributors = [],
  emojiMap = {},
  hueMap = {},
  iconSet = 'emoji',
}: {
  delta: CycleDelta | null;
  contributors?: DeltaContributor[];
  emojiMap?: Record<string, string>;
  hueMap?: Record<string, number>;
  iconSet?: IconSet;
}) {
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
    <section className="panel flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          This cycle vs last
        </h2>
        <span className="tnum text-2xl font-semibold" style={{ color }}>
          {up ? '↑' : '↓'} {formatBahtWhole(Math.abs(delta.delta))}
        </span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {up ? 'more than' : 'less than'} last cycle ({formatBahtWhole(delta.prevTotal)})
        </span>
      </div>
      {contributors.length > 0 ? (
        <ul
          className="flex flex-col gap-2.5 border-t pt-3"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {contributors.map((c) => {
            const rose = c.delta > 0;
            return (
              <li key={c.category} className="flex items-center gap-3 text-sm">
                <CategoryIcon
                  emoji={emojiFor(emojiMap, c.category)}
                  name={c.category}
                  hue={hueFor(hueMap, c.category)}
                  iconSet={iconSet}
                />
                <span className="min-w-0 flex-1 truncate">{c.category}</span>
                <span
                  className="tnum shrink-0"
                  style={{ color: rose ? 'var(--color-loss)' : 'var(--color-accent-text)' }}
                >
                  {rose ? '↑' : '↓'} {formatBahtWhole(Math.abs(c.delta))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
