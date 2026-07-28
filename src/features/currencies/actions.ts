'use client';

import { getBrowserDb } from '@db/browser';
import { bumpDataVersion } from '@shared/data-version';
import { addCurrency, setCurrencyOffBudget, setCurrencyArchived } from './queries';

export async function addCurrencyAction(code: string): Promise<void> {
  const db = await getBrowserDb();
  await addCurrency(db, code);
  bumpDataVersion();
}

export async function setCurrencyOffBudgetAction(code: string, offBudget: boolean): Promise<void> {
  const db = await getBrowserDb();
  await setCurrencyOffBudget(db, code, offBudget);
  bumpDataVersion();
}

export async function setCurrencyArchivedAction(code: string, archived: boolean): Promise<void> {
  const db = await getBrowserDb();
  await setCurrencyArchived(db, code, archived);
  bumpDataVersion();
}
