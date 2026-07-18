import { eq, and, gt, isNotNull } from 'drizzle-orm';
import type { Db } from '@db/client';
import { entries } from '@features/entries/schema';
import { categories } from '@features/categories/schema';
import { accounts } from '@features/accounts/schema';
import { categoryIdFor } from '@features/categories/queries';
import { accountIdFor } from '@features/accounts/queries';
import { recurrences, type Recurrence, type NewRecurrence } from './schema';
import { nextOccurrence } from './schedule';
import type { RuleCatalogRow } from '@features/settings/catalog';

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
//
// maxDate null = the restored ledger is EMPTY, so every pointer rewinds to null ("never posted")
// and the sweep refills from startDate. It must be null rather than a low sentinel like '':
// paidCount() short-circuits on `lastPosted === null` and otherwise runs month arithmetic over the
// string, so '' would clear that guard and produce NaN.
export async function rewindRecurrences(db: Db, maxDate: string | null): Promise<void> {
  await db
    .update(recurrences)
    .set({ lastPosted: maxDate })
    .where(
      maxDate === null
        ? isNotNull(recurrences.lastPosted)
        : and(isNotNull(recurrences.lastPosted), gt(recurrences.lastPosted, maxDate)),
    )
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

// Active rules as catalog rows: category/account by NAME (innerJoin — a rule always has both; the
// delete guards keep them from being removed while referenced), and a yearly rule's renewal month
// derived from its startDate. Drops the runtime pointer/startDate/startSeq — the backup carries the
// definition, not the progress.
export async function getRuleCatalog(db: Db): Promise<RuleCatalogRow[]> {
  const rows = await db
    .select({
      name: recurrences.name,
      category: categories.name,
      account: accounts.name,
      amount: recurrences.amount,
      currency: recurrences.currency,
      rate: recurrences.rate,
      day: recurrences.day,
      intervalMonths: recurrences.intervalMonths,
      totalCount: recurrences.totalCount,
      startDate: recurrences.startDate,
    })
    .from(recurrences)
    .innerJoin(categories, eq(recurrences.categoryId, categories.id))
    .innerJoin(accounts, eq(recurrences.accountId, accounts.id))
    .where(eq(recurrences.archived, 0))
    .orderBy(recurrences.id)
    .all();
  return rows.map(({ startDate, ...rest }) => ({
    ...rest,
    month: rest.intervalMonths === 12 ? Number(startDate.split('-')[1]) : null,
  }));
}

// Restore rules from a catalog file. Insert-if-name-absent: a rule whose name already exists (archived
// or not) is skipped, never edited or deleted — non-destructive and idempotent, like the catalog's
// category/account upsert. An inserted rule starts FRESH: startSeq 1, lastPosted null (schema
// default), and startDate = its next due date from today, so it never back-posts old months.
// Category/account names resolve (creating a missing one) just as an entry write does.
export async function restoreRecurrencesFromCatalog(
  db: Db,
  rows: RuleCatalogRow[],
  todayIso: string,
): Promise<void> {
  if (rows.length === 0) return;
  const existing = new Set(
    (await db.select({ name: recurrences.name }).from(recurrences).all()).map((r) => r.name),
  );
  for (const row of rows) {
    if (existing.has(row.name)) continue;
    existing.add(row.name); // guard against a file that lists the same name twice
    const categoryId = await categoryIdFor(db, row.category);
    const accountId = await accountIdFor(db, row.account);
    await addRule(db, {
      name: row.name,
      day: row.day,
      intervalMonths: row.intervalMonths,
      categoryId,
      accountId,
      amount: row.amount,
      currency: row.currency,
      rate: row.rate,
      totalCount: row.totalCount,
      startSeq: 1,
      startDate: nextOccurrence(row.day, row.month, todayIso, row.intervalMonths),
    });
  }
}
