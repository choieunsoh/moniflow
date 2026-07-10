'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureBudgetsTable } from './schema';
import { setBudget, deleteBudget } from './queries';

// The budgets page passes '' for the total (null-category) row.
function normalize(category: string): string | null {
  return category === '' ? null : category;
}

// Called directly from the client BudgetField when an amount input blurs (auto-save). A bad or
// negative amount is dropped rather than thrown — single-user tool, and the number input already
// constrains entry; this is just the server-side backstop.
export async function saveBudget(category: string, amount: number): Promise<void> {
  if (!Number.isFinite(amount) || amount < 0) return;
  const db = initDb();
  ensureBudgetsTable(db);
  setBudget(db, normalize(category), amount);
  revalidatePath('/', 'layout');
}

export async function removeBudget(category: string): Promise<void> {
  const db = initDb();
  ensureBudgetsTable(db);
  deleteBudget(db, normalize(category));
  revalidatePath('/', 'layout');
}
