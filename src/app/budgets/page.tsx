// Reads the local SQLite DB per request, so opt out of static generation (same as /dashboard).
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctCategories, getCategoryBreakdown } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey, cycleProgress } from '@features/entries/cycle';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { getBudgets } from '@features/budgets/queries';
import { setBudgetAction, deleteBudgetAction } from '@features/budgets/actions';
import {
  toBudgetRows,
  toBudgetTotal,
  type BudgetState,
  type BudgetRow,
} from '@features/budgets/budget-status';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { ensureCategoryMetaTable } from '@features/categories/schema';
import { getEmojiMap, getHueMap, emojiFor, hueFor } from '@features/categories/queries';
import { CategoryIcon } from '@features/categories/ui/CategoryIcon';
import { PageContainer } from '@shared/ui/PageContainer';
import { formatBaht } from '@shared/money';
import { todayIso } from '@shared/date';

// The meter colour IS the state, so it never stands alone — every row pairs it with a word
// ("left" / "over" / "No budget") so meaning survives grayscale and colour blindness.
const METER: Record<BudgetState, string> = {
  over: 'var(--color-loss)',
  near: 'var(--color-warn)',
  under: 'var(--color-accent)',
  none: 'var(--color-border-strong)',
};

export default function BudgetsPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureBudgetsTable(db);
  ensureSettingsTable(db);
  ensureCategoryMetaTable(db);

  const cutoff = getCutoff(db);
  const today = todayIso();
  const cycle = cycleFromKey(currentCycleKey(today, cutoff), cutoff);
  const progress = cycleProgress(cycle, today);

  // This cycle's spend per category (magnitudes — the ledger stores outflow as negative).
  const breakdown = getCategoryBreakdown(db, cycle.start, cycle.end);
  const spentByCategory = new Map(breakdown.map((b) => [b.key, Math.abs(b.total)]));
  const totalSpent = breakdown.reduce((sum, b) => sum + Math.abs(b.total), 0);

  const limits = new Map<string, number>();
  let totalLimit: number | null = null;
  for (const b of getBudgets(db)) {
    if (b.category === null) totalLimit = b.amount;
    else limits.set(b.category, b.amount);
  }

  const emojis = getEmojiMap(db);
  const hues = getHueMap(db);
  const iconSet = getIconSet(db);

  const rows = toBudgetRows(getDistinctCategories(db), limits, spentByCategory);
  const total = toBudgetTotal(totalLimit, totalSpent);

  // A tracker leads with what's live this cycle. "Active" = spent something OR has a limit; the
  // long tail of categories with neither (historical, idle this cycle) is tucked behind a
  // disclosure so it stays reachable to budget without burying the rows that matter.
  const active = rows.filter((r) => r.spent > 0 || r.limit !== null);
  const dormant = rows.filter((r) => r.spent === 0 && r.limit === null);
  const rowProps = { emojis, hues, iconSet };

  return (
    <PageContainer size="narrow">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Standing monthly limits, tracked against this cycle&rsquo;s spending.
        </p>
      </header>

      {/* Total — the hero read: how much of the whole-cycle budget is gone. */}
      <section className="panel flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Total</h2>
          <span className="chip tnum">{cycle.label}</span>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="tnum text-3xl font-semibold">{formatBaht(totalSpent)}</span>
          <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
            spent
            {total.limit !== null && (
              <>
                {' '}
                of <span className="tnum">{formatBaht(total.limit)}</span>
              </>
            )}
          </span>
        </div>

        {total.limit !== null ? (
          <>
            <Meter pct={total.pct} state={total.state} tall />
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <Remaining row={total} />
              <Pace day={progress.day} total={progress.total} row={total} />
            </div>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-faint)' }}>
            No total budget yet — set one to track the whole cycle at a glance.
          </p>
        )}

        <EditDisclosure
          label={total.limit === null ? 'Set total budget' : 'Edit total budget'}
          category=""
          amount={total.limit ?? undefined}
          showDelete={total.limit !== null}
        />
      </section>

      {/* By category — attention-first: over/near-budget rows float to the top. */}
      <section className="panel p-5">
        <h2 className="mb-1 text-base font-semibold">By category</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
            No categories yet — import or add entries first, then set a limit here.
          </p>
        ) : (
          <ul className="flex flex-col">
            {active.map((row) => (
              <CategoryRow key={row.category} row={row} {...rowProps} />
            ))}
          </ul>
        )}

        {dormant.length > 0 && (
          <details className="group mt-1 border-t pt-1">
            <summary className="tap cursor-pointer list-none py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span
                className="inline-flex items-center gap-1"
                style={{ color: 'var(--color-muted)' }}
              >
                Other categories
                <span className="tnum">({dormant.length})</span>
                <Chevron />
              </span>
            </summary>
            <ul className="flex flex-col">
              {dormant.map((row) => (
                <CategoryRow key={row.category} row={row} {...rowProps} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </PageContainer>
  );
}

// One category's tracker row: a <details> whose summary is the read view (marker, spend / limit,
// meter, remaining) and whose body is the edit form — so the whole list stays a calm read until you
// tap a row to change its limit. No client JS: native disclosure + Server-Action form.
function CategoryRow({
  row,
  emojis,
  hues,
  iconSet,
}: {
  row: BudgetRow;
  emojis: Record<string, string>;
  hues: Record<string, number>;
  iconSet: IconSet;
}) {
  return (
    <li className="border-b last:border-0">
      <details className="group">
        <summary className="tap flex cursor-pointer list-none flex-col gap-2 py-3 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <CategoryIcon
              emoji={emojiFor(emojis, row.category)}
              name={row.category}
              size="sm"
              iconSet={iconSet}
              hue={hueFor(hues, row.category)}
            />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.category}</span>
            <span className="tnum text-sm">{formatBaht(row.spent)}</span>
            {row.limit !== null && (
              <span className="tnum text-sm" style={{ color: 'var(--color-muted)' }}>
                / {formatBaht(row.limit)}
              </span>
            )}
            <Chevron />
          </div>
          <Meter pct={row.pct} state={row.state} />
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <Remaining row={row} />
            {row.limit !== null && (
              <span className="tnum" style={{ color: 'var(--color-faint)' }}>
                {Math.round(row.pct)}%
              </span>
            )}
          </div>
        </summary>
        <div className="pb-3">
          <BudgetForm
            category={row.category}
            amount={row.limit ?? undefined}
            showDelete={row.limit !== null}
          />
        </div>
      </details>
    </li>
  );
}

// The spend meter. Decorative (aria-hidden) — the honest numbers live in the text beside it; this
// just makes proportion legible at a glance. The fill eases via transform (no layout thrash) on the
// re-render after a save; the global reduced-motion rule neutralizes it. Skipped for 'none': an
// unbudgeted row has nothing to meter, and a full neutral bar would misread as "maxed out".
function Meter({ pct, state, tall }: { pct: number; state: BudgetState; tall?: boolean }) {
  if (state === 'none') return null;
  return (
    <div
      aria-hidden
      className={`${tall ? 'h-2.5' : 'h-2'} overflow-hidden rounded-full`}
      style={{ background: 'var(--color-border)' }}
    >
      <div
        className="h-full w-full origin-left rounded-full"
        style={{
          transform: `scaleX(${pct / 100})`,
          background: METER[state],
          transition: 'transform var(--dur) var(--ease-out)',
        }}
      />
    </div>
  );
}

// Remaining-to-limit, stated with a word so the state never rides on colour alone.
function Remaining({ row }: { row: Pick<BudgetRow, 'state' | 'remaining'> }) {
  if (row.state === 'none') {
    return <span style={{ color: 'var(--color-faint)' }}>No budget</span>;
  }
  if (row.state === 'over') {
    return (
      <span className="font-medium" style={{ color: 'var(--color-loss)' }}>
        <span className="tnum">{formatBaht(Math.abs(row.remaining))}</span> over
      </span>
    );
  }
  const color = row.state === 'near' ? 'var(--color-warn)' : 'var(--color-muted)';
  return (
    <span style={{ color }}>
      <span className="tnum">{formatBaht(row.remaining)}</span> left
    </span>
  );
}

// Cycle pace: how far into the cycle we are. Flags "Ahead of pace" when spend has outrun the
// elapsed share of the cycle by a clear margin — an honest early-warning before you actually
// breach the cap.
function Pace({
  day,
  total: days,
  row,
}: {
  day: number;
  total: number;
  row: Pick<BudgetRow, 'state' | 'spent' | 'limit'>;
}) {
  const elapsedShare = day / days;
  const spentShare = row.limit && row.limit > 0 ? row.spent / row.limit : 0;
  const ahead = row.state !== 'over' && spentShare > elapsedShare + 0.05;
  return (
    <span className="flex items-center gap-2" style={{ color: 'var(--color-faint)' }}>
      {ahead && (
        <span className="chip" style={{ color: 'var(--color-warn)' }}>
          Ahead of pace
        </span>
      )}
      <span className="tnum">
        Day {day} of {days}
      </span>
    </span>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="var(--color-faint)"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 transition-transform duration-150 group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// A <details> disclosure wrapping the total's edit form, so the summary panel stays a clean read
// until you choose to change the number. Category rows are their own <details>, so they inline the
// form directly.
function EditDisclosure({
  label,
  category,
  amount,
  showDelete,
}: {
  label: string;
  category: string;
  amount: number | undefined;
  showDelete: boolean;
}) {
  return (
    <details className="group border-t pt-3">
      <summary className="tap cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span
          className="inline-flex items-center gap-1"
          style={{ color: 'var(--color-accent-text)' }}
        >
          {label}
          <Chevron />
        </span>
      </summary>
      <div className="pt-3">
        <BudgetForm category={category} amount={amount} showDelete={showDelete} />
      </div>
    </details>
  );
}

// Progressive-enhancement edit: plain <form>s over Server Actions, so setting a limit works with no
// client JS. Same control vocabulary the rest of the app uses (.btn primary / ghost, min-11 input).
function BudgetForm({
  category,
  amount,
  showDelete,
}: {
  category: string;
  amount: number | undefined;
  showDelete: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={setBudgetAction} className="flex flex-1 items-center gap-2">
        <input type="hidden" name="category" value={category} />
        <input
          type="number"
          name="amount"
          step="1"
          min="0"
          inputMode="numeric"
          defaultValue={amount ?? ''}
          placeholder="Monthly limit (฿)"
          aria-label={category ? `${category} monthly limit` : 'Total monthly limit'}
          className="tnum min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] px-3 text-base"
          style={{
            border: '1px solid var(--color-border-strong)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
          }}
        />
        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </form>
      {showDelete && (
        <form action={deleteBudgetAction}>
          <input type="hidden" name="category" value={category} />
          <button type="submit" className="btn btn-ghost">
            Remove
          </button>
        </form>
      )}
    </div>
  );
}
