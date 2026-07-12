'use server';

// ponytail: unlike categories (whose entries-touching mutate-actions live in entries/actions.ts),
// the accounts feature owns its own actions.ts and imports the entries-touching QUERY fns
// (renameAccount/deleteAccount/mergeAccountInto/undoMergeAccount) from entries/queries. Those ops
// correctly live in entries/queries per the features→db/shared arrow (arrow-compliant); this is a
// thin, acyclic wrapper coupling (entries/queries never imports accounts/actions). Deliberate: the
// feature owning its actions reads cleaner than the categories layout. Revisit if it causes churn.
import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureAccountsTable } from './schema';
import { addAccount, setAccountIcon, setAccountHue, setAccountOrder } from './queries';
import {
  renameAccount,
  deleteAccount,
  mergeAccountInto,
  undoMergeAccount,
  type AccountMergeSnapshot,
} from '@features/entries/queries';

// Create an empty account. Trimmed; blank is ignored. Duplicate names no-op in addAccount.
export async function addAccountAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name.trim()) return;
  const db = initDb();
  ensureAccountsTable(db);
  addAccount(db, name.trim());
  revalidatePath('/', 'layout');
}

// Assign an icon key to an account (upsert).
export async function setAccountIconAction(formData: FormData): Promise<void> {
  const account = formData.get('account');
  const icon = formData.get('icon');
  if (typeof account !== 'string' || typeof icon !== 'string' || !account || !icon) return;
  const db = initDb();
  ensureAccountsTable(db);
  setAccountIcon(db, account, icon);
  revalidatePath('/', 'layout');
}

// Set (or reset, via "auto") an account's disc hue.
export async function setAccountHueAction(formData: FormData): Promise<void> {
  const account = formData.get('account');
  const hueRaw = formData.get('hue');
  if (typeof account !== 'string' || !account || typeof hueRaw !== 'string') return;
  const hue = hueRaw === 'auto' ? null : Number(hueRaw);
  if (hue !== null && (!Number.isInteger(hue) || hue < 0 || hue > 359)) return;
  const db = initDb();
  ensureAccountsTable(db);
  setAccountHue(db, account, hue);
  revalidatePath('/', 'layout');
}

// Rename an account, or merge into an existing one when `to` already names a different account.
export async function mergeAccountAction(formData: FormData): Promise<void> {
  const from = formData.get('from');
  const to = formData.get('to');
  if (typeof from !== 'string' || typeof to !== 'string' || !from || !to.trim()) return;
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  renameAccount(db, from, to.trim());
  revalidatePath('/', 'layout');
}

// Delete an account. deleteAccount guards emptiness, so a used one is a no-op even if the UI submits it
// (the two-tap delete button is only shown at count 0).
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const name = formData.get('name');
  if (typeof name !== 'string' || !name) return;
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  deleteAccount(db, name);
  revalidatePath('/', 'layout');
}

// Merge-and-remove a USED account: reassign its entries into `to`, delete the source, and return the
// undo snapshot to the client so the Undo toast can reverse it. Typed args (not FormData) so the caller
// gets the snapshot back.
export async function mergeAndRemoveAccount(
  from: string,
  to: string,
): Promise<AccountMergeSnapshot> {
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  const snap = mergeAccountInto(db, from, to);
  revalidatePath('/', 'layout');
  return snap;
}

// Reverse a merge-and-remove from its snapshot (the Undo toast's action).
export async function undoMergeAndRemoveAccount(snap: AccountMergeSnapshot): Promise<void> {
  const db = initDb();
  ensureEntriesTable(db);
  ensureAccountsTable(db);
  undoMergeAccount(db, snap);
  revalidatePath('/', 'layout');
}

// Persist the keypad's manual account order. Typed args — the client posts the new order as string[].
export async function reorderAccounts(orderedNames: string[]): Promise<void> {
  const db = initDb();
  ensureAccountsTable(db);
  setAccountOrder(db, orderedNames);
  revalidatePath('/', 'layout');
}
