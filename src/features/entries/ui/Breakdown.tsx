import Link from 'next/link';
import { formatBahtWhole } from '@shared/money';
import { toBars } from '../breakdown';
import type { Breakdown as BreakdownRow } from '../queries';
import { emojiFor, hueFor } from '@features/categories/queries';
import { CategoryIconButton } from '@features/categories/ui/CategoryPicker';
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
// Pass `colors` (category → hex) to fill each unbudgeted bar with that category's own colour instead
// of the flat accent. Home passes the donut's slice colours so a category keeps ONE identity across
// the chart/list toggle; callers with no colour scheme omit it and keep the accent. Budgeted rows
// ignore it — their meter colour is a state signal (over/near), which outranks identity.
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
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {bars.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing in this cycle.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bars.map((b) => {
            const spent = Math.abs(b.total);
            const limit = limits?.get(b.key);
            const status = limit === undefined ? null : toBudgetTotal(limit, spent);
            // Icon-excepted tap-through to the category's filtered records — home passes cycleKey.
            const href = cycleKey
              ? `/records?cycle=${encodeURIComponent(cycleKey)}&category=${encodeURIComponent(b.key)}`
              : null;
            // Row body minus the icon: the label line and the bar/meter. Wrapped in a Link when a
            // cycleKey is given, else a plain div — the icon (a button) stays a sibling either way,
            // never nested inside the anchor.
            const body = (
              <>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{b.key}</span>
                    <span className="tnum shrink-0" style={{ color: 'var(--color-muted)' }}>
                      ({b.count})
                    </span>
                  </span>
                  <span className="tnum" style={{ color: 'var(--color-text)' }}>
                    {status
                      ? `${formatBahtWhole(spent)} / ${formatBahtWhole(status.limit ?? 0)}`
                      : formatBahtWhole(spent)}
                  </span>
                </div>
                {status ? (
                  <BudgetMeter status={status} pacePct={pacePct} />
                ) : (
                  <div
                    className="h-2 overflow-hidden rounded"
                    style={{ background: 'var(--color-border)' }}
                  >
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${b.pct}%`,
                        background: colors?.get(b.key) ?? 'var(--color-accent)',
                      }}
                    />
                  </div>
                )}
              </>
            );
            return (
              <li key={b.key} className="flex items-start gap-1.5">
                {/* A category breakdown (emojis passed) leads with a marker tappable to edit its
                    icon; needs a CategoryPickerProvider ancestor (the app layout mounts one). An
                    account breakdown passes no emojis, so the marker is simply absent. */}
                {emojis ? (
                  <CategoryIconButton
                    emoji={emojiFor(emojis, b.key)}
                    category={b.key}
                    iconSet={iconSet}
                    hue={hues ? hueFor(hues, b.key) : undefined}
                    size="sm"
                  />
                ) : null}
                {/* min-h-11: the tap-through is the primary drill-down and sits beside a 44px icon
                    button that opens a different thing, so anything under the 44px floor mis-fires
                    under a thumb. The static variant matches it to keep the row rhythm identical. */}
                {href ? (
                  <Link
                    href={href}
                    aria-label={`${b.key} records this cycle`}
                    className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
