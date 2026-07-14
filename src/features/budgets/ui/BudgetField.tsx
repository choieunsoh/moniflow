'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useBudgetInput, formatBudgetAmount } from '../use-budget-input';
import { saveBudget, removeBudget } from '../actions';

// Inline amount editor for one category (or the total, category=''). Sits at the end of the row —
// a fixed-width, right-aligned number field plus a "×" to clear the budget. The field auto-saves on
// blur (no Save button); an unset budget shows nothing but its suggestion as `placeholder`, so
// leaving it untouched never writes. `amount` is the committed baseline the hook diffs against.
// Writes run in a transition that dims the field until the Server Action's revalidation lands. When
// there is no budget to remove, an equal-width spacer keeps every input's right edge aligned.
export function BudgetField({
  category,
  amount,
  prefill,
  placeholder,
}: {
  category: string;
  amount: number | undefined;
  prefill: string;
  placeholder: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { onBlur, onKeyDown } = useBudgetInput(amount, (next) =>
    startTransition(async () => {
      await saveBudget(category, next);
      router.refresh(); // guarantee the row re-renders (× + progress bar) even if cache revalidation is slow
    }),
  );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        defaultValue={formatBudgetAmount(prefill)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          onBlur(e);
          e.currentTarget.value = formatBudgetAmount(e.currentTarget.value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={category ? `${category} monthly limit` : 'Total monthly limit'}
        className="tnum min-h-11 w-24 rounded-[var(--radius-md)] px-3 text-center text-base transition-opacity placeholder:[color:var(--color-muted)]"
        style={{
          border: '1px solid var(--color-border-strong)',
          background: 'var(--color-surface-2)',
          color: 'var(--color-text)',
          opacity: pending ? 0.55 : 1,
        }}
      />
      {amount !== undefined ? (
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await removeBudget(category);
              router.refresh();
            })
          }
          aria-label={category ? `Remove ${category} budget` : 'Remove total budget'}
          className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-[var(--radius-md)] transition-colors hover:[color:var(--color-loss)] hover:[background:var(--color-surface-2)]"
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
      ) : (
        <span aria-hidden className="size-11 shrink-0" />
      )}
    </div>
  );
}
