import Link from 'next/link';
import { formatBahtWhole } from '@shared/money';
import { toBars, type Bar } from '../breakdown';
import { MAX_SLICES } from '../donut';
import type { Breakdown as BreakdownRow } from '../queries';
import { emojiFor, hueFor } from '@features/categories/queries';
import { CategoryEditTrigger, CategoryIconButton } from '@features/categories/ui/CategoryPicker';
import { CategoryGlyph } from '@features/categories/ui/CategoryGlyph';
import type { IconSet } from '@features/settings/queries';
import { toBudgetTotal } from '@features/budgets/budget-status';
import { BudgetMeter } from '@features/budgets/ui/BudgetMeter';

// A ranked bar list — outflow-heavy categories/accounts read at a glance. Magnitudes only (spending
// is negative); the bar width is relative to the biggest row in the set. Pass `emojis` to lead each
// row with its category marker, rendered per `iconSet`; `hues` gives each marker its picked color.
// Pass `limits` (category → monthly limit) to turn budgeted rows into spent-vs-limit meters; rows
// with no limit keep the plain relative bar. `pacePct` (time elapsed in the cycle) draws the "today"
// pace tick on each budgeted meter — forwarded straight to BudgetMeter, current cycle only.
// Pass `cycleKey` to make each row (icon excepted) a tap-through to that category's records for the
// cycle — home opts in; account breakdowns omit it and stay static.
// Pass `colors` (category → hex) to fill each unbudgeted bar with that category's own colour. Home
// passes the donut's slice colours so a category keeps ONE identity across the chart/list toggle.
// Rows with no mapped colour — and callers that pass none at all — get a neutral track rather than
// the accent, so "no colour assigned" never impersonates an identity colour. Budgeted rows ignore
// `colors` entirely: their meter colour is a state signal (over/near), which outranks identity.
export function Breakdown({
  title,
  rows,
  emojis,
  hues,
  iconSet = 'emoji',
  limits,
  pacePct,
  cycleKey,
  colors,
}: {
  title: string;
  rows: BreakdownRow[];
  emojis?: Record<string, string>;
  hues?: Record<string, number>;
  iconSet?: IconSet;
  limits?: Map<string, number>;
  pacePct?: number;
  cycleKey?: string;
  colors?: Map<string, string>;
}) {
  const bars = toBars(rows);
  // Same fold point as the donut, so both views lead with the same categories in the same order.
  // The tail stays reachable rather than being collapsed into an inert "Other" the way the ring
  // has to — a list can afford to keep every row tappable behind one disclosure.
  const lead = bars.slice(0, MAX_SLICES);
  const tail = bars.slice(MAX_SLICES);

  const row = (b: Bar) => {
    const spent = Math.abs(b.total);
    const limit = limits?.get(b.key);
    const status = limit === undefined ? null : toBudgetTotal(limit, spent);
    // One lookup for both the mark and the bar, so they cannot disagree about a category's colour.
    const color = colors?.get(b.key);
    // Icon-excepted tap-through to the category's filtered records — home passes cycleKey.
    const href = cycleKey
      ? `/records?cycle=${encodeURIComponent(cycleKey)}&category=${encodeURIComponent(b.key)}`
      : null;
    // Row body minus the icon: the label line and the bar/meter. Wrapped in a Link when a
    // cycleKey is given, else a plain div — the icon (a button) stays a sibling either way,
    // never nested inside the anchor.
    const body = (
      <>
        {/* gap-x-3 and a shrink-0 figures group: justify-between alone let the count and the amount
            touch once a long category name ate the row — "Electronics and Very ...(1)฿12,500". The
            share column mirrors the donut legend's — same rounding, same right-aligned w-9 — so a
            category reads identically in both views. */}
        <div className="flex items-baseline justify-between gap-x-3 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{b.key}</span>
            <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
              ({b.count})
            </span>
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            <span className="tnum" style={{ color: 'var(--color-text)' }}>
              {status
                ? `${formatBahtWhole(spent)} / ${formatBahtWhole(status.limit ?? 0)}`
                : formatBahtWhole(spent)}
            </span>
            <span className="tnum w-9 text-right" style={{ color: 'var(--color-faint)' }}>
              {b.share}%
            </span>
          </span>
        </div>
        {status ? (
          <BudgetMeter status={status} pacePct={pacePct} />
        ) : (
          <div
            className="h-2 overflow-hidden rounded"
            style={{ background: 'var(--color-border)' }}
          >
            {/* Unmapped rows fall back to a NEUTRAL track colour, not the accent. Categories past
                the palette have no slice to match, and filling them with #7132f5 put them a hair
                from Rent's identity #7c5cff — so two near-identical purples meant "this category"
                and "no colour assigned". A partial identity promise is worse than none; grey reads
                honestly as "no colour here". */}
            <div
              className="h-full rounded"
              style={{
                width: `${b.pct}%`,
                background: color ?? 'var(--color-border-strong)',
              }}
            />
          </div>
        )}
      </>
    );
    return (
      <li key={b.key} className="flex items-start gap-1.5">
        {/* A category breakdown (emojis passed) leads with a marker tappable to edit its icon; needs
            a CategoryPickerProvider ancestor (the app layout mounts one). An account breakdown
            passes no emojis, so the marker is simply absent. */}
        {emojis ? (
          color ? (
            // Same construction as the donut legend's LegendRow: the slice colour on the disc, the
            // glyph inside it. The row's bar already took this colour so a category reads the same
            // across the chart/list toggle, but the MARK was still drawn in the category's own
            // picked hue — so Rent arrived with a teal bar under an olive disc, and changed colour
            // when you flipped the toggle. Identity is one colour or it is not an identity; the
            // picked hue still shows wherever it is the thing being edited (the picker, Records,
            // Categories). Budgeted rows keep this disc too: the meter below is a STATE signal and
            // the disc is identity, which is the same split the chart view already makes.
            <CategoryEditTrigger
              category={b.key}
              emoji={emojiFor(emojis, b.key)}
              hue={hues ? hueFor(hues, b.key) : undefined}
            >
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-full text-2xl"
                style={{ background: color, color: 'var(--color-on-accent)' }}
              >
                <CategoryGlyph emoji={emojiFor(emojis, b.key)} iconSet={iconSet} size={26} />
              </span>
            </CategoryEditTrigger>
          ) : (
            // No slice colour for this row — the palette ran out past the fold, or the caller passed
            // no colours at all. Falls back to the picked-hue disc rather than inventing a colour,
            // for the same reason the bar falls back to a neutral track: a partial identity promise
            // is worse than none.
            <CategoryIconButton
              emoji={emojiFor(emojis, b.key)}
              category={b.key}
              iconSet={iconSet}
              hue={hues ? hueFor(hues, b.key) : undefined}
              size="sm"
            />
          )
        ) : null}
        {/* min-h-11: the tap-through is the primary drill-down and sits beside a 44px icon button
            that opens a different thing, so anything under the 44px floor mis-fires under a thumb.
            The static variant matches it to keep the row rhythm identical. */}
        {href ? (
          <Link
            href={href}
            aria-label={`${b.key} records this cycle`}
            className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1"
          >
            {body}
          </Link>
        ) : (
          <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1">{body}</div>
        )}
      </li>
    );
  };

  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {bars.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing in this cycle.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">{lead.map(row)}</ul>
          {/* Native <details>: a disclosure is exactly what this is, and the element brings its own
              keyboard operability, AT semantics and open/close state for free. The tail is the long
              quiet end of the ranking — 12 near-identical 2px stubs if shown by default, which is
              what the page used to end on. */}
          {tail.length > 0 ? (
            <details className="mt-3">
              <summary
                className="tap flex cursor-pointer items-center text-sm"
                style={{ color: 'var(--color-accent-text)' }}
              >
                {tail.length} more {tail.length === 1 ? 'category' : 'categories'}
              </summary>
              <ul className="mt-3 flex flex-col gap-3">{tail.map(row)}</ul>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}
