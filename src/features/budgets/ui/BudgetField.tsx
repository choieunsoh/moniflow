'use client';

import { useTransition } from 'react';
import { useBudgetInput } from '../use-budget-input';
import { saveBudget, removeBudget } from '../actions';

// Inline budget editor for one category (or the total, category=''). The amount input auto-saves on
// blur — no Save button — and a "×" clears the budget. `prefill` is the initial display value (the
// saved limit, or a suggestion for an unset budget); `amount` is the committed baseline the hook
// diffs against, so blurring an unchanged field never writes. Both writes run in a transition, which
// dims the input until the Server Action's revalidation lands.
export function BudgetField({
  category,
  amount,
  prefill,
  hint,
}: {
  category: string;
  amount: number | undefined;
  prefill: string;
  hint?: string;
}) {
  const [pending, startTransition] = useTransition();
  const { onBlur, onKeyDown } = useBudgetInput(amount, (next) =>
    startTransition(async () => {
      await saveBudget(category, next);
    }),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          defaultValue={prefill}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          placeholder="Monthly limit (฿)"
          aria-label={category ? `${category} monthly limit` : 'Total monthly limit'}
          className="tnum min-h-11 min-w-0 flex-1 rounded-[var(--radius-md)] px-3 text-base transition-opacity"
          style={{
            border: '1px solid var(--color-border-strong)',
            background: 'var(--color-surface-2)',
            color: 'var(--color-text)',
            opacity: pending ? 0.55 : 1,
          }}
        />
        {amount !== undefined && (
          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await removeBudget(category);
              })
            }
            aria-label={category ? `Remove ${category} budget` : 'Remove total budget'}
            className="tap grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)] transition-colors hover:[color:var(--color-loss)] hover:[background:var(--color-surface-2)]"
            style={{ color: 'var(--color-faint)' }}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width={18}
              height={18}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {hint && (
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
