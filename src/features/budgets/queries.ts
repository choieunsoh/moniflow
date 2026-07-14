import { eq, isNull } from 'drizzle-orm';
import type { Db } from '@db/client';
import { budgets, type BudgetReadRow } from './schema';
import { categories } from '@features/categories/schema';
import { categoryIdFor } from '@features/categories/queries';

// Read budgets with their category name joined (null for the total row) so the page + budget-status
// model keep working with names. leftJoin because the total row has a null category_id.
export async function getBudgets(db: Db): Promise<BudgetReadRow[]> {
  return await db
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
// never equal in a UNIQUE index, so the total row can't be conflict-upserted. isNull handles the
// null/total case explicitly; eq(col, null) would compile to an always-false comparison and silently
// fail to clear the old total row. A per-category budget resolves its name to an id (creating it if new).
export async function setBudget(db: Db, category: string | null, amount: number): Promise<void> {
  const categoryId = category === null ? null : await categoryIdFor(db, category);
  const del =
    categoryId === null
      ? db.delete(budgets).where(isNull(budgets.categoryId))
      : db.delete(budgets).where(eq(budgets.categoryId, categoryId));
  await db.batch([del, db.insert(budgets).values({ categoryId, amount })]);
}

// A per-category delete must look the category up by name to get its id — there's no longer a category
// text column on budgets to match against directly. isNull handles the null/total row.
export async function deleteBudget(db: Db, category: string | null): Promise<void> {
  if (category === null) {
    await db.delete(budgets).where(isNull(budgets.categoryId)).run();
    return;
  }
  const row = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.name, category))
    .get();
  if (!row) return; // unknown category → nothing to delete
  await db.delete(budgets).where(eq(budgets.categoryId, row.id)).run();
}
