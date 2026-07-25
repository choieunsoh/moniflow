'use client';

import { setCategoryOffBudgetAction } from '../actions';
import { withSaveToast } from '@shared/ui/with-save-toast';

// Per-category off-budget flag: a plain checkbox (there's only one boolean to pick, no picker dialog
// needed) that calls setCategoryOffBudgetAction directly — same typed-args shape as reorderCategories
// — which bumps the data version so the Home + Budgets meters refetch and drop this category's spend.
export function OffBudgetToggle({ category, checked }: { category: string; checked: boolean }) {
  return (
    <label
      className="tap flex shrink-0 items-center gap-1.5 text-xs whitespace-nowrap"
      style={{ color: 'var(--color-muted)' }}
      title="Off-budget: this category's spend won't count toward budgets or pace"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) =>
          void withSaveToast(setCategoryOffBudgetAction, 'Category updated')(
            category,
            e.currentTarget.checked,
          )
        }
        aria-label={`Off-budget: exclude ${category} from budget meters and pace`}
      />
      Off-budget
    </label>
  );
}
