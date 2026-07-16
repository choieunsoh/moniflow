import { getBrowserDb } from '@db/browser';
import type { Db } from '@db/client';
import { categoryIdFor } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';
import { parseRuleForm, type RuleInput } from './rule-form';
import { addRule, updateRule, archiveRule } from './queries';
import type { NewRecurrence } from './schema';

// The feature's client-side write layer against the browser OPFS db — plain async functions, not
// Server Actions (there is no server). A failed parse throws; the caller's boundary surfaces it.
// Each successful write bumps the shared data-version so live read-hooks refetch.

// Resolve the input's account/category NAMES to ids at the DB boundary, exactly as entries' toRow does.
async function toRow(db: Db, input: RuleInput): Promise<NewRecurrence> {
  const { account, category, ...rest } = input;
  return {
    ...rest,
    categoryId: await categoryIdFor(db, category),
    accountId: await accountIdFor(db, account),
  };
}

export async function addRuleAction(formData: FormData): Promise<void> {
  const result = parseRuleForm(formData, todayIso());
  if (!result.ok) throw new Error(result.error);
  const db = await getBrowserDb();
  await addRule(db, await toRow(db, result.rule));
  bumpDataVersion();
}

// Editing never touches lastPosted: the pointer is the sweep's alone. Changing an amount or rate
// affects FUTURE posts only — already-posted entries are ordinary ledger rows and stay as they were.
export async function editRuleAction(formData: FormData): Promise<void> {
  const result = parseRuleForm(formData, todayIso());
  if (!result.ok) throw new Error(result.error);
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await updateRule(db, id, await toRow(db, result.rule));
  bumpDataVersion();
}

export async function archiveRuleAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await archiveRule(db, id);
  bumpDataVersion();
}
