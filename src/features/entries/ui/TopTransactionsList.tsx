import Link from 'next/link';
import type { EntryRow } from '../schema';
import type { IconSet } from '@features/settings/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { emojiFor, hueFor } from '@features/categories/queries';
import { formatLedgerSpend } from '@shared/money';
import { formatDayHeading } from '@shared/date';

// The cycle's biggest single purchases (see topTransactions) — the outliers the category donut
// averages away. A ranked list of individual entries: category disc + the note (or category when
// untitled) + its day, tapping through to that entry. "See all" opens Records ranked biggest-first.
// Renders nothing when the cycle has no spend (the caller only mounts it inside the spending branch,
// but guard anyway so it's safe to place elsewhere).
export function TopTransactionsList({
  entries,
  emojiMap,
  hueMap,
  iconSet,
  cycleKey,
}: {
  entries: EntryRow[];
  emojiMap: Record<string, string>;
  hueMap: Record<string, number>;
  iconSet: IconSet;
  cycleKey: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="panel flex flex-col gap-3 p-5" aria-label="Top transactions this cycle">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>
          Top transactions
        </h2>
        <Link
          href={`/records?cycle=${cycleKey}&sort=amount`}
          prefetch={false}
          className="text-sm font-medium"
          style={{ color: 'var(--color-accent-text)' }}
        >
          See all →
        </Link>
      </div>
      <ul className="flex flex-col gap-2.5">
        {entries.map((e) => {
          // Ranked by magnitude (see topTransactions), so a big refund can land in this list too —
          // it must not print as a purchase. Same idiom as SwipeRow: a spend states its cost plainly,
          // a refund gets an explicit + and gain colour, in both the visible figure and the aria-label.
          const amountText = formatLedgerSpend(e.amount);
          const amountColor = e.amount < 0 ? 'var(--color-text)' : 'var(--color-gain)';
          return (
            <li key={e.id}>
              <Link
                prefetch={false}
                href={`/entries/edit?id=${e.id}`}
                // Lead with the note (the visible primary line) when present, keeping the category for
                // context — the icon is aria-hidden, so without this a screen reader loses it.
                aria-label={`${e.note ? `${e.note} (${e.category})` : e.category} ${amountText} on ${formatDayHeading(e.date)}`}
                className="flex min-h-11 items-center gap-3 text-sm"
              >
                <CategoryIcon
                  emoji={emojiFor(emojiMap, e.category)}
                  name={e.category}
                  hue={hueFor(hueMap, e.category)}
                  iconSet={iconSet}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{e.note ? e.note : e.category}</span>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                    {formatDayHeading(e.date)}
                  </span>
                </span>
                <span className="tnum shrink-0" style={{ color: amountColor }}>
                  {amountText}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
