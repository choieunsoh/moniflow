import { getBrowserDb } from '@db/browser';
import { setBudget, deleteBudget } from './queries';
import { bumpDataVersion } from '@shared/data-version';

// The budgets page passes '' for the total (null-category) row.
function normalize(category: string): string | null {
  return category === '' ? null : category;
}

// Client-side budget writes against the browser OPFS db (offline-first — no 'use server'/revalidatePath;
// the worker bootstraps tables, so no ensure* needed). Called directly from the client BudgetField when
// an amount input blurs (auto-save). A bad or negative amount is dropped rather than thrown — single-user
// tool, and the number input already constrains entry; this is just a backstop. Each write bumps the
// shared data-version store so live read-hooks (Plan 2b) refetch.
export async function saveBudget(category: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount < 0) return;
  const db = await getBrowserDb();
  await setBudget(db, normalize(category), amount);
  bumpDataVersion();
}

export async function removeBudget(category: string): Promise<void> {
  const db = await getBrowserDb();
  await deleteBudget(db, normalize(category));
  bumpDataVersion();
}
