import { eq, and, gt, isNotNull } from 'drizzle-orm';
import type { Db } from '@db/client';
import { entries } from '@features/entries/schema';
import { categories } from '@features/categories/schema';
import { accounts } from '@features/accounts/schema';
import { recurrences, type Recurrence, type NewRecurrence } from './schema';

// Typed reads/writes for recurring rules. Column selections infer row types — no `as` casts.

// Non-archived rules, oldest first, so the page's order is stable as rules are added.
export async function listRules(db: Db): Promise<Recurrence[]> {
  return await db
    .select()
    .from(recurrences)
    .where(eq(recurrences.archived, 0))
    .orderBy(recurrences.id)
    .all();
}

export async function getRule(db: Db, id: number): Promise<Recurrence | undefined> {
  return await db.select().from(recurrences).where(eq(recurrences.id, id)).get();
}

export async function addRule(db: Db, rule: NewRecurrence): Promise<void> {
  await db.insert(recurrences).values(rule).run();
}

export async function updateRule(db: Db, id: number, rule: Partial<NewRecurrence>): Promise<void> {
  await db.update(recurrences).set(rule).where(eq(recurrences.id, id)).run();
}

// Archive, never delete — posted history stays explainable, and the rule can come back.
export async function archiveRule(db: Db, id: number): Promise<void> {
  await db.update(recurrences).set({ archived: 1 }).where(eq(recurrences.id, id)).run();
}

// Advance the pointer to the newest date just posted. The ONLY mutation the sweep makes to a rule.
export async function markPosted(db: Db, id: number, date: string): Promise<void> {
  await db.update(recurrences).set({ lastPosted: date }).where(eq(recurrences.id, id)).run();
}

// Called after a replace-all CSV restore. The backup carries no rule id, so after a restore the
// ledger and the rules are strangers: a rule may claim it posted through July while the restored
// ledger stops at June. Clamping every pointer to the CSV's newest date makes the next sweep refill
// the gap, and because seq DERIVES from lastPosted (see schedule.ts) the payment numbers come back
// correct with no extra work.
//
// Clamping is correct in both directions: entries at or before maxDate are already in the restored
// ledger and must not repost; the CSV holds nothing after maxDate, so everything after it must.
// Archived rules are rewound too — an archived rule can be un-archived later, and a stale pointer
// would silently skip its gap.
export async function rewindRecurrences(db: Db, maxDate: string): Promise<void> {
  await db
    .update(recurrences)
    .set({ lastPosted: maxDate })
    .where(and(isNotNull(recurrences.lastPosted), gt(recurrences.lastPosted, maxDate)))
    .run();
}

// Per-rule display fields for the /recurring page: the category marker (name/emoji/hue) and account
// name. A rule stores only categoryId/accountId (see schema.ts) — this is the one place that resolves
// them, kept OUT of listRules/useRecurring so that hook's test can mock this file down to just
// `listRules`. leftJoin (not innerJoin) because both FKs are nullable columns.
export type RuleMeta = {
  id: number;
  categoryName: string | null;
  categoryEmoji: string | null;
  categoryHue: number | null;
  accountName: string | null;
};

export async function listRuleMeta(db: Db): Promise<RuleMeta[]> {
  return await db
    .select({
      id: recurrences.id,
      categoryName: categories.name,
      categoryEmoji: categories.emoji,
      categoryHue: categories.hue,
      accountName: accounts.name,
    })
    .from(recurrences)
    .leftJoin(categories, eq(recurrences.categoryId, categories.id))
    .leftJoin(accounts, eq(recurrences.accountId, accounts.id))
    .where(eq(recurrences.archived, 0))
    .all();
}

// The sweep's insert shape. Unlike EntryInput (which carries category/account NAMES for the query
// layer to resolve), a rule already holds the ids — so these go straight in, skipping the
// name→id→name round trip that addEntries would impose.
export type PostRow = {
  date: string;
  accountId: number | null;
  categoryId: number | null;
  amount: number;
  currency: string | null;
  originalAmount: number | null;
  note: string;
};

// source 'recurring' joins 'manual' | 'monefy'. It is not carried by the Monefy CSV, so it does not
// survive a backup round-trip — the note is what identifies these rows durably.
export async function postRecurringEntries(db: Db, rows: PostRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(entries)
    .values(rows.map((r) => ({ ...r, time: null, source: 'recurring' })))
    .run();
}
