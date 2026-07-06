import type { Db } from '@db/client';
import { entries, type Entry, type NewEntry } from './schema';

// Typed reads/writes for the entries feature. Server Components and the CLI call these directly
// — no API layer. Column selections infer row types, so no `as` casts are needed.
export function addEntries(db: Db, rows: NewEntry[]): void {
  db.insert(entries).values(rows).run();
}

export function getEntries(db: Db): Entry[] {
  return db.select().from(entries).all();
}

// ponytail: nets in JS over the full table — fine at scaffold scale. Upgrade to a SQL
// `sum(amount)` aggregate if the ledger grows past what's cheap to load.
export function getNetFlow(db: Db): number {
  return getEntries(db).reduce((sum, r) => sum + r.amount, 0);
}
