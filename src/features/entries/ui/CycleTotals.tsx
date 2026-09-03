import { formatBahtWhole } from '@shared/money';
import { BudgetMeter } from '@features/budgets/ui/BudgetMeter';
import { pacePhrase, type BudgetTotal } from '@features/budgets/budget-status';

type CycleTotalsProps = {
  grossSpend: number;
  refunded: number;
  net: number;
  offBudgetTotal: number;
  fixedPosted: number;
  discretionarySpend: number;
  totalStatus: BudgetTotal | null;
  pacePct: number | undefined;
  showPace: boolean;
};

// The Home headline, split into two blocks: the card used to put two frames on one line, gross
// spend measured against a ceiling that had already had that same fixed cost deducted. Top block
// is what left the account and agrees with the ring below it; bottom block is the budget and is
// the only place a denominator appears. They agree by being separate, each true in one frame.
export function CycleTotals({
  grossSpend,
  refunded,
  net,
  offBudgetTotal,
  fixedPosted,
  discretionarySpend,
  totalStatus,
  pacePct,
  showPace,
}: CycleTotalsProps) {
  return (
    <>
      <section className="panel -mt-3 flex flex-col gap-1.5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
            Spent this cycle
          </h2>
          <span className="tnum text-xl font-semibold">{formatBahtWhole(grossSpend)}</span>
        </div>
        {refunded > 0 ? (
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {formatBahtWhole(refunded)} refunded · net {formatBahtWhole(net)}
          </span>
        ) : null}
        {offBudgetTotal > 0 ? (
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {formatBahtWhole(offBudgetTotal)} off-budget
          </span>
        ) : null}
        {fixedPosted > 0 ? (
          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
            {formatBahtWhole(fixedPosted)} fixed cost, deducted from the budget
          </span>
        ) : null}
      </section>

      {totalStatus ? (
        <section className="panel -mt-3 flex flex-col gap-1.5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
              Spent from budget
            </h2>
            <span className="tnum text-xl font-semibold">
              {formatBahtWhole(Math.max(discretionarySpend, 0))}
              <span className="text-sm font-normal" style={{ color: 'var(--color-muted)' }}>
                {' '}
                of {formatBahtWhole(totalStatus.limit ?? 0)}
              </span>
            </span>
          </div>
          <BudgetMeter status={totalStatus} pacePct={pacePct} />
          {showPace && pacePct !== undefined && totalStatus.state !== 'over' ? (
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {pacePhrase(totalStatus.pct, pacePct)}
            </span>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
