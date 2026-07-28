import { eq, asc } from 'drizzle-orm';
import type { Db } from '@db/client';
import type { CurrencyCatalogRow } from '@features/settings/catalog';
import { currencies, type CurrencyRow } from './schema';

// The currencies this ledger has actually used, plus the ones its owner is likely to. off_budget = 1
// means "being in this currency means being abroad": JPY/KRW/HKD/MOP are trips, while USD/EUR/GBP
// appear here only as online purchases and must stay inside the monthly budget.
// THB is home currency, sorted first, and is never off-budget.
export const SEED_CURRENCIES = [
  { code: 'THB', offBudget: 0, sortOrder: 0 },
  { code: 'JPY', offBudget: 1, sortOrder: 1 },
  { code: 'KRW', offBudget: 1, sortOrder: 2 },
  { code: 'HKD', offBudget: 1, sortOrder: 3 },
  { code: 'MOP', offBudget: 1, sortOrder: 4 },
  { code: 'USD', offBudget: 0, sortOrder: 5 },
  { code: 'EUR', offBudget: 0, sortOrder: 6 },
  { code: 'GBP', offBudget: 0, sortOrder: 7 },
  { code: 'SGD', offBudget: 0, sortOrder: 8 },
] as const;

// Seed on READ, not on migration: an existing OPFS database gets the table from CREATE TABLE IF NOT
// EXISTS but no rows, and an empty currency picker is the same first-run dead end the empty category
// picker once was. Idempotent — a row that already exists is left exactly as the user configured it.
async function seedIfEmpty(db: Db): Promise<void> {
  const existing = await db.select({ code: currencies.code }).from(currencies).all();
  if (existing.length > 0) return;
  for (const row of SEED_CURRENCIES) {
    await db
      .insert(currencies)
      .values({ code: row.code, offBudget: row.offBudget, sortOrder: row.sortOrder })
      .onConflictDoNothing()
      .run();
  }
}

// Ordered for the picker: sortOrder first (THB is 0), then code so a user-added currency without an
// explicit order still lands somewhere stable rather than wherever sqlite feels like.
export async function listCurrencies(db: Db): Promise<CurrencyRow[]> {
  await seedIfEmpty(db);
  return db
    .select()
    .from(currencies)
    .where(eq(currencies.archived, 0))
    .orderBy(asc(currencies.sortOrder), asc(currencies.code))
    .all();
}

// Every row including archived ones — the management page needs to show what it can un-archive.
export async function listAllCurrencies(db: Db): Promise<CurrencyRow[]> {
  await seedIfEmpty(db);
  return db
    .select()
    .from(currencies)
    .orderBy(asc(currencies.sortOrder), asc(currencies.code))
    .all();
}

// The set isOffBudget consults. Archived currencies still count — a historical JPY row must stay
// off-budget even after the currency is hidden from the picker.
export async function getTravelCurrencies(db: Db): Promise<Set<string>> {
  await seedIfEmpty(db);
  const rows = await db
    .select({ code: currencies.code })
    .from(currencies)
    .where(eq(currencies.offBudget, 1))
    .all();
  return new Set(rows.map((r) => r.code));
}

// Valid codes for entry validation — archived ones are excluded, so hiding a currency also stops new
// entries in it while leaving old ones intact.
export async function getCurrencyCodes(db: Db): Promise<Set<string>> {
  const rows = await listCurrencies(db);
  return new Set(rows.map((r) => r.code));
}

// Every known code, archived included — for recognising the currency an EXISTING entry is already
// in, not for deciding whether a NEW entry (or a currency change) may be saved as one. Archiving a
// currency must not make history unreadable: an old JPY row has to keep reading as JPY even once JPY
// is hidden from the picker, or the edit keypad falls back to THB and a save then drops the row's
// original foreign amount. Use getCurrencyCodes for anything write-facing.
export async function getAllCurrencyCodes(db: Db): Promise<Set<string>> {
  const rows = await listAllCurrencies(db);
  return new Set(rows.map((r) => r.code));
}

export async function addCurrency(db: Db, code: string): Promise<void> {
  await seedIfEmpty(db);
  await db.insert(currencies).values({ code }).onConflictDoNothing().run();
}

export async function setCurrencyOffBudget(
  db: Db,
  code: string,
  offBudget: boolean,
): Promise<void> {
  await seedIfEmpty(db);
  await db
    .update(currencies)
    .set({ offBudget: offBudget ? 1 : 0 })
    .where(eq(currencies.code, code))
    .run();
}

export async function setCurrencyArchived(db: Db, code: string, archived: boolean): Promise<void> {
  await seedIfEmpty(db);
  await db
    .update(currencies)
    .set({ archived: archived ? 1 : 0 })
    .where(eq(currencies.code, code))
    .run();
}

// Every currency including archived ones — a backup that dropped archived rows would resurrect them
// as active on restore.
export async function getCurrencyCatalog(db: Db): Promise<CurrencyCatalogRow[]> {
  const rows = await listAllCurrencies(db);
  return rows.map((r) => ({
    code: r.code,
    offBudget: r.offBudget === 1,
    sortOrder: r.sortOrder,
    archived: r.archived === 1,
  }));
}

// Upsert each row by code — updates an existing currency's flags, inserts a missing one. NEVER
// deletes: a currency only this device knows about must survive a restore. No seedIfEmpty: this is
// an INSERT ... ON CONFLICT, not a bare UPDATE, so — unlike setCurrencyOffBudget/setCurrencyArchived
// — it inserts a row regardless of whether the table has ever been read, and calling it here would
// just seed defaults this merge is about to overwrite anyway.
export async function restoreCurrencyCatalog(db: Db, rows: CurrencyCatalogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const mk = (r: CurrencyCatalogRow) => {
    const values = {
      code: r.code,
      offBudget: r.offBudget ? 1 : 0,
      sortOrder: r.sortOrder,
      archived: r.archived ? 1 : 0,
    };
    return db
      .insert(currencies)
      .values(values)
      .onConflictDoUpdate({
        target: currencies.code,
        set: {
          offBudget: values.offBudget,
          sortOrder: values.sortOrder,
          archived: values.archived,
        },
      });
  };
  const [first, ...rest] = rows;
  await db.batch([mk(first), ...rest.map(mk)]);
}
