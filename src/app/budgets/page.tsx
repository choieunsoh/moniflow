// Reads the local SQLite DB per request, so opt out of static generation (same as /dashboard).
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getDistinctCategories } from '@features/entries/queries';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { getBudgets } from '@features/budgets/queries';
import { setBudgetAction, deleteBudgetAction } from '@features/budgets/actions';
import { PageContainer } from '@shared/ui/PageContainer';

export default function BudgetsPage() {
  const db = initDb();
  ensureEntriesTable(db);
  ensureBudgetsTable(db);

  const categories = getDistinctCategories(db);
  const allBudgets = getBudgets(db);
  const budgetByCategory = new Map(
    allBudgets.filter((b) => b.category !== null).map((b) => [b.category, b.amount]),
  );
  const total = allBudgets.find((b) => b.category === null) ?? null;

  return (
    <PageContainer size="narrow">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Budgets</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Standing monthly limits — the same budget applies to every billing cycle.
        </p>
      </header>

      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">Total</h2>
        <BudgetFormRow category="" amount={total?.amount} showDelete={total !== null} />
      </section>

      <section className="panel flex flex-col gap-4 p-5">
        <h2 className="text-base font-semibold">By category</h2>
        {categories.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No categories yet — import or add entries first.
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {categories.map((category) => (
              <li
                key={category}
                className="flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0"
              >
                <span className="text-sm font-medium">{category}</span>
                <BudgetFormRow
                  category={category}
                  amount={budgetByCategory.get(category)}
                  showDelete={budgetByCategory.has(category)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

function BudgetFormRow({
  category,
  amount,
  showDelete,
}: {
  category: string;
  amount: number | undefined;
  showDelete: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <form action={setBudgetAction} className="flex items-center gap-2">
        <input type="hidden" name="category" value={category} />
        <input
          type="number"
          name="amount"
          step="1"
          min="0"
          defaultValue={amount ?? ''}
          placeholder="Amount (฿)"
          className="w-32 rounded px-2 py-1 text-sm"
          style={{
            border: '1px solid var(--color-border)',
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
