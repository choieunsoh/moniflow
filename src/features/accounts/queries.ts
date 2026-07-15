import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import type { AccountCatalogRow } from '@features/settings/catalog';
import { accounts } from './schema';

// Shown for any account without an assigned icon. 'card' is the neutral generic glyph.
export const FALLBACK_ICON = 'card';

// The closed glyph set the icon picker offers and AccountGlyph resolves. Keys only — the SVGs live in
// AccountGlyph. Kept here so the picker and the resolver share one source of truth.
export const ACCOUNT_ICONS = [
  'cash',
  'card',
  'visa',
  'mastercard',
  'jcb',
  'unionpay',
  'amex',
  'qr',
] as const;

export type AccountIcon = (typeof ACCOUNT_ICONS)[number];

export async function getAccountIconMap(db: Db): Promise<Record<string, string>> {
  const rows = await db.select({ name: accounts.name, icon: accounts.icon }).from(accounts).all();
  const map: Record<string, string> = {};
  for (const row of rows) map[row.name] = row.icon;
  return map;
}

export function iconForAccount(map: Record<string, string>, name: string): string {
  return map[name] ?? FALLBACK_ICON;
}

// Upsert: assigning an icon replaces any prior one. Creates the account row if the name is new.
export async function setAccountIcon(db: Db, name: string, icon: string): Promise<void> {
  await db
    .insert(accounts)
    .values({ name, icon })
    .onConflictDoUpdate({ target: accounts.name, set: { icon } })
    .run();
}

// Only accounts with a picked hue land in the map; the rest fall through to the name-derived color.
export async function getAccountHueMap(db: Db): Promise<Record<string, number>> {
  const rows = await db.select({ name: accounts.name, hue: accounts.hue }).from(accounts).all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.hue !== null) map[row.name] = row.hue;
  return map;
}

export function hueForAccount(map: Record<string, number>, name: string): number | undefined {
  return map[name];
}

// Upsert the hue. `null` resets to auto. A new name gets the fallback icon to satisfy NOT NULL; an
// existing row keeps its icon (only hue changes).
export async function setAccountHue(db: Db, name: string, hue: number | null): Promise<void> {
  await db
    .insert(accounts)
    .values({ name, icon: FALLBACK_ICON, hue })
    .onConflictDoUpdate({ target: accounts.name, set: { hue } })
    .run();
}

// Only accounts with a manual sort_order land in the map; unordered ones are absent (caller sorts
// them last). Mirrors getAccountHueMap.
export async function getAccountOrderMap(db: Db): Promise<Record<string, number>> {
  const rows = await db
    .select({ name: accounts.name, sortOrder: accounts.sortOrder })
    .from(accounts)
    .all();
  const map: Record<string, number> = {};
  for (const row of rows) if (row.sortOrder !== null) map[row.name] = row.sortOrder;
  return map;
}

// Persist a manual order: write a dense 0..n-1 to sort_order across the named accounts, in one
// batch. Names not present are no-ops (UPDATE ... WHERE name). Materialises the whole visible
// grid on every drop, so there is never a mix of ordered and half-ordered rows the user dragged.
export async function setAccountOrder(db: Db, orderedNames: string[]): Promise<void> {
  if (orderedNames.length === 0) return;
  const mk = (name: string, i: number) =>
    db.update(accounts).set({ sortOrder: i }).where(eq(accounts.name, name));
  const [first, ...rest] = orderedNames;
  await db.batch([mk(first, 0), ...rest.map((name, i) => mk(name, i + 1))]);
}

// Create an empty account (no entries yet) with the fallback icon. No-op if the name already exists,
// so it never clobbers an existing account's icon/hue. Restyle with the picker afterwards.
export async function addAccount(db: Db, name: string): Promise<void> {
  await db
    .insert(accounts)
    .values({ name, icon: FALLBACK_ICON })
    .onConflictDoNothing({ target: accounts.name })
    .run();
}

// Resolve an account name to its id, creating the row (fallback icon) if the name is new. The single
// write-boundary that turns the name-based UI/import into id-based storage. Idempotent.
export async function accountIdFor(db: Db, name: string): Promise<number> {
  await db
    .insert(accounts)
    .values({ name, icon: FALLBACK_ICON })
    .onConflictDoNothing({ target: accounts.name })
    .run();
  const row = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.name, name))
    .get();
  if (!row) throw new Error(`accountIdFor: could not resolve account "${name}"`);
  return row.id;
}

export async function getAccountCatalog(db: Db): Promise<AccountCatalogRow[]> {
  return db
    .select({
      name: accounts.name,
      icon: accounts.icon,
      hue: accounts.hue,
      sortOrder: accounts.sortOrder,
    })
    .from(accounts)
    .orderBy(accounts.name)
    .all();
}

// Upsert each row by name — updates the metadata of an existing account, inserts a missing one.
// NEVER deletes: unlisted accounts may be referenced by entries. One batch.
export async function restoreAccountCatalog(db: Db, rows: AccountCatalogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const mk = (r: AccountCatalogRow) =>
    db
      .insert(accounts)
      .values({ name: r.name, icon: r.icon, hue: r.hue, sortOrder: r.sortOrder })
      .onConflictDoUpdate({
        target: accounts.name,
        set: { icon: r.icon, hue: r.hue, sortOrder: r.sortOrder },
      });
  const [first, ...rest] = rows;
  await db.batch([mk(first), ...rest.map(mk)]);
}
