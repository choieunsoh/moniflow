// Reads the local SQLite DB per request, so opt out of static generation (same as /dashboard).
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctCategories, getCategoryBreakdown } from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { getBudgets } from '@features/budgets/queries';
import { BudgetField } from '@features/budgets/ui/BudgetField';
import {
  toBudgetRows,
  toBudgetTotal,
  suggestBudget,
  type BudgetState,
  type BudgetRow,
} from '@features/budgets/budget-status';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff, getIconSet, type IconSet } from '@features/settings/queries';
import { ensureCategoriesTable } from '@features/categories/schema';
import { getEmojiMap, getHueMap, emojiFor, hueFor } from '@features/categories/queries';
import { CategoryIconButton } from '@features/categories/ui/CategoryPicker';
import { PageContainer } from '@shared/ui/PageContainer';
import { formatBaht } from '@shared/money';
import { todayIso } from '@shared/date';

// A thin colour-only glance of spend against the limit you set — red over, amber near, accent under.
// This page is for setting budgets, so the exact "left"/percent figures are intentionally omitted;
// the bar is a hint, and the spend figure beside the input carries the honest number.
const METER: Record<BudgetState, string> = {
  over: 'var(--color-loss)',
  near: 'var(--color-warn)',
  under: 'var(--color-accent)',
  none: 'var(--color-border-strong)',
};

// Build the inline editor's props from a category's limit + spend. A set budget shows its saved
// amount; an unset budget stays EMPTY — the suggestion (rounded from this cycle's spend) rides in
// the placeholder as a hint, not a filled value, so leaving an untouched row never auto-saves it.
// `amount` is the committed baseline the field diffs against on blur (undefined until a budget
// actually exists), so the empty field is a clean no-op on blur.
function fieldProps(category: string, limit: number | null, spent: number) {
  const suggestion = limit === null ? suggestBudget(spent) : null;
  return {
    category,
    amount: limit ?? undefined,
    prefill: limit !== null ? String(limit) : '',
    placeholder: suggestion !== null ? formatBaht(suggestion) : 'Amount',
  };
}

export default function BudgetsPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureBudgetsTable(db);
  ensureSettingsTable(db);
  ensureCategoriesTable(db);

  const cutoff = getCutoff(db);
  const cycle = cycleFromKey(currentCycleKey(todayIso(), cutoff), cutoff);

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
          Set a standing monthly limit for each category — it applies to every billing cycle.
        </p>
      </header>

      {/* Total — the whole-cycle limit, set inline like every category. */}
      <section className="panel flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Total</h2>
          <span className="chip tnum">{cycle.label}</span>
        </div>
        {/* Row 1: label · amount · × */}
        <div className="flex items-center gap-3">
          <span
            className="min-w-0 flex-1 text-sm font-medium"
            style={{ color: 'var(--color-muted)' }}
          >
            Limit for the whole cycle
          </span>
          <BudgetField {...fieldProps('', total.limit, total.spent)} />
        </div>
        {/* Row 2: this cycle's spend · progress bar */}
        {(total.limit !== null || total.spent > 0) && (
          <div className="flex items-center gap-3">
            <span className="tnum shrink-0 text-xs" style={{ color: 'var(--color-faint)' }}>
              {formatBaht(total.spent)} spent
            </span>
            {total.state !== 'none' && (
              <div className="min-w-0 flex-1">
                <Meter pct={total.pct} state={total.state} tall />
              </div>
            )}
          </div>
        )}
      </section>

      {/* By category — each row edits inline; biggest spenders (most worth budgeting) surface first. */}
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

// One category's set row — the limit is edited inline (no tap-to-expand): marker + name, the spend
// figure for context, and the amount input right there. A thin meter under a budgeted row is the
// only tracking left; the "left"/percent readouts are gone so the surface stays about setting.
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
    <li className="flex flex-col gap-2 border-b py-3 last:border-0">
      {/* Row 1: marker · name · amount · × */}
      <div className="flex items-center gap-3">
        <CategoryIconButton
          emoji={emojiFor(emojis, row.category)}
          category={row.category}
          iconSet={iconSet}
          hue={hueFor(hues, row.category)}
          size="sm"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.category}</span>
        <BudgetField {...fieldProps(row.category, row.limit, row.spent)} />
      </div>
      {/* Row 2: this cycle's spend · progress bar, aligned under the name (past the icon). Shown for
          any budgeted row too, so setting a limit always surfaces a bar (empty until you spend). */}
      {(row.limit !== null || row.spent > 0) && (
        <div className="flex items-center gap-3 pl-10">
          <span className="tnum shrink-0 text-xs" style={{ color: 'var(--color-faint)' }}>
            {formatBaht(row.spent)} spent
          </span>
          {row.state !== 'none' && (
            <div className="min-w-0 flex-1">
              <Meter pct={row.pct} state={row.state} />
            </div>
          )}
        </div>
      )}
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
