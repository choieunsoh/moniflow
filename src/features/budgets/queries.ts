import { eq, isNull } from 'drizzle-orm';
import type { Db } from '@db/client';
import { budgets, type BudgetReadRow } from './schema';
import { categories } from '@features/categories/schema';
import { categoryIdFor } from '@features/categories/queries';

// Read budgets with their category name joined (null for the total row) so the page + budget-status
// model keep working with names. leftJoin because the total row has a null category_id.
export function getBudgets(db: Db): BudgetReadRow[] {
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      category: categories.name,
      amount: budgets.amount,
    })
    .from(budgets)
    .leftJoin(categories, eq(budgets.categoryId, categories.id))
    .all();
}

// Upsert-by-category (or the null-category total). Delete+insert rather than ON CONFLICT: NULLs are
// never equal in a UNIQUE index, so the total row can't be conflict-upserted; isNull handles it
// explicitly. A per-category budget resolves its name to an id (creating the category if new).
export function setBudget(db: Db, category: string | null, amount: number): void {
  const categoryId = category === null ? null : categoryIdFor(db, category);
  db.transaction((tx) => {
    if (categoryId === null) tx.delete(budgets).where(isNull(budgets.categoryId)).run();
    else tx.delete(budgets).where(eq(budgets.categoryId, categoryId)).run();
    tx.insert(budgets).values({ categoryId, amount }).run();
  });
}

export function deleteBudget(db: Db, category: string | null): void {
  if (category === null) {
    db.delete(budgets).where(isNull(budgets.categoryId)).run();
    return;
  }
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, category))
    .get();
  if (!row) return; // unknown category → nothing to delete
  db.delete(budgets).where(eq(budgets.categoryId, row.id)).run();
}
