import { eq, isNull } from 'drizzle-orm';
import type { Db } from '@db/client';
import { budgets, type Budget } from './schema';

// Typed reads/writes for the budgets feature — standing (non-cycle) spending limits.
export function getBudgets(db: Db): Budget[] {
  return db.select().from(budgets).all();
}

// Upsert-by-category: delete any existing row for this category (or the null-category total
// row), then insert the new amount. A plain delete+insert instead of INSERT ... ON CONFLICT
// because SQLite would need a UNIQUE index on category to conflict-detect, and NULL values are
// never considered equal to each other in a UNIQUE index — the total row could never be reliably
// upserted that way. isNull(...) handles the total row explicitly; eq(col, null) would compile to
// an always-false comparison and silently fail to clear the old total row.
export function setBudget(db: Db, category: string | null, amount: number): void {
  db.transaction((tx) => {
    if (category === null) {
      tx.delete(budgets).where(isNull(budgets.category)).run();
    } else {
      tx.delete(budgets).where(eq(budgets.category, category)).run();
    }
    tx.insert(budgets).values({ category, amount }).run();
  });
}

export function deleteBudget(db: Db, category: string | null): void {
  if (category === null) {
    db.delete(budgets).where(isNull(budgets.category)).run();
  } else {
    db.delete(budgets).where(eq(budgets.category, category)).run();
  }
}
