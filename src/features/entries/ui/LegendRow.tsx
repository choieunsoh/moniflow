'use client';

import Link from 'next/link';
import { formatBahtWhole } from '@shared/money';
import { emojiFor, hueFor } from '@features/categories/queries';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import { CategoryEditTrigger } from '@features/categories/ui/CategoryPicker';
import type { IconSet } from '@features/settings/queries';
import type { DonutSlice } from '../donut';

// One row of the donut's colour-keyed legend: the slice's mark, the category, its transaction count,
// what it cost, and its share of the cycle.
//
// The row carries TWO independent targets, which is why it isn't simply one big link: the mark opens
// the category's icon/colour picker, the rest taps through to that category's records. Both clear the
// 44px floor — the text half used to be a 20px strip beside a 44px disc, so a thumb aiming at the
// category name reliably opened the picker instead.
//
// The synthetic "Other" bucket is not a real category: nothing to edit, and no records match it. It
// renders inert and dimmed so it doesn't read as a tappable row that silently does nothing.
export function LegendRow({
  slice,
  total,
  cycleKey,
  emojis,
  hues,
  iconSet,
}: {
  slice: DonutSlice;
  total: number;
  cycleKey: string;
  emojis: Record<string, string>;
  hues: Record<string, number>;
  iconSet: IconSet;
}) {
  const share = total === 0 ? 0 : Math.round((slice.value / total) * 100);
  // Slice colour and category icon combined into one mark: a disc in the ring's colour with the icon
  // inside. Editing changes the category's own hue; the disc keeps the slice colour either way.
  const disc = (
    <span
      aria-hidden
      className="grid size-11 shrink-0 place-items-center rounded-full text-2xl"
      style={{
        background: slice.color,
        color: 'var(--color-on-fill)',
        opacity: slice.other ? 0.55 : 1,
      }}
    >
      <CategoryGlyph emoji={emojiFor(emojis, slice.name)} iconSet={iconSet} size={26} />
    </span>
  );

  // Wraps rather than truncating: at 200% zoom / Extra Large text a single rigid row squeezed the
  // category name down to nothing, leaving "(5) ฿4,899 97%" — every number and no subject. The name
  // keeps a 6rem basis and the figures travel together, so when space runs out the figures drop to
  // their own line and the name stays legible.
  const figures = (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="flex min-w-0 flex-[1_1_6rem] items-baseline gap-1">
        <span className="truncate">{slice.name}</span>
        <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
          ({slice.count})
        </span>
      </span>
      <span className="flex shrink-0 items-baseline gap-3">
        <span className="tnum" style={{ color: 'var(--color-muted)' }}>
          {formatBahtWhole(slice.value)}
        </span>
        <span className="tnum w-9 text-right" style={{ color: 'var(--color-faint)' }}>
          {share}%
        </span>
      </span>
    </span>
  );

  return (
    <li className="flex items-center gap-3 text-sm">
      {slice.other ? (
        disc
      ) : (
        <CategoryEditTrigger
          category={slice.name}
          emoji={emojiFor(emojis, slice.name)}
          hue={hueFor(hues, slice.name)}
        >
          {disc}
        </CategoryEditTrigger>
      )}
      {slice.other ? (
        <span
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
          style={{ color: 'var(--color-muted)' }}
        >
          {figures}
        </span>
      ) : (
        <Link
          prefetch={false}
          href={`/records?cycle=${cycleKey}&category=${encodeURIComponent(slice.name)}`}
          aria-label={`${slice.name} records this cycle`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3"
        >
          {figures}
        </Link>
      )}
    </li>
  );
}
