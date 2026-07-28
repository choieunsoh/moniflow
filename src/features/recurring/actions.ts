import { getBrowserDb } from '@db/browser';
import type { Db } from '@db/client';
import { categoryIdFor } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';
import { parseRuleForm, type RuleInput } from './rule-form';
import { addRule, updateRule, archiveRule, getRule } from './queries';
import type { NewRecurrence } from './schema';
import { getCurrencyCodes } from '@features/currencies/queries';

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
  const db = await getBrowserDb();
  const validCodes = await getCurrencyCodes(db);
  const result = parseRuleForm(formData, todayIso(), validCodes);
  if (!result.ok) throw new Error(result.error);
  await addRule(db, await toRow(db, result.rule));
  bumpDataVersion();
}

// Editing never touches lastPosted: the pointer is the sweep's alone. Changing an amount or rate
// affects FUTURE posts only — already-posted entries are ordinary ledger rows and stay as they were.
//
// It hands the parser the CURRENT rule so the schedule anchor (startDate) is kept when the schedule
// is unchanged. Recomputing startDate from today on every edit would silently rewind paidCount — a
// mid-installment edit would drop the paid count and the sweep would repost payments as duplicates.
// The parser moves the anchor only when the cadence or a yearly rule's month actually changed.
export async function editRuleAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  const existing = await getRule(db, id);
  const validCodes = await getCurrencyCodes(db);
  // Same reasoning as editEntryAction: an archived currency stops NEW rules, but must not lock an
  // already-existing rule out of being saved at all once it correctly keeps reading as its own
  // currency (use-edit-rule's recognition fix).
  if (existing?.currency !== null && existing?.currency !== undefined) {
    validCodes.add(existing.currency);
  }
  const result = parseRuleForm(
    formData,
    todayIso(),
    validCodes,
    existing && { startDate: existing.startDate, intervalMonths: existing.intervalMonths },
  );
  if (!result.ok) throw new Error(result.error);
  await updateRule(db, id, await toRow(db, result.rule));
  bumpDataVersion();
}

export async function archiveRuleAction(formData: FormData): Promise<void> {
  const id = Number(formData.get('id'));
  const db = await getBrowserDb();
  await archiveRule(db, id);
  bumpDataVersion();
}
