'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureBudgetsTable } from './schema';
import { setBudget, deleteBudget } from './queries';

// Empty string means "the total" — the <input type="hidden" name="category" value="" /> case
// from the budgets page's total-budget form.
function parseCategory(formData: FormData): string | null {
  const raw = formData.get('category');
  return typeof raw === 'string' && raw !== '' ? raw : null;
}

export async function setBudgetAction(formData: FormData): Promise<void> {
  const category = parseCategory(formData);
  const amountRaw = formData.get('amount');
  const amount = typeof amountRaw === 'string' ? Number(amountRaw) : NaN;
  // A bad/blank submission is silently dropped rather than throwing — single-user tool, no
  // client-side validation yet.
  if (Number.isNaN(amount) || amount < 0) return;

  const db = initDb();
  ensureBudgetsTable(db);
  setBudget(db, category, amount);
  revalidatePath('/', 'layout');
}

export async function deleteBudgetAction(formData: FormData): Promise<void> {
  const category = parseCategory(formData);

  const db = initDb();
  ensureBudgetsTable(db);
  deleteBudget(db, category);
  revalidatePath('/', 'layout');
}
