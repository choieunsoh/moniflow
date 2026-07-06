import { desc } from 'drizzle-orm';
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

export function getRecentEntries(db: Db, limit = 8): Entry[] {
  return db.select().from(entries).orderBy(desc(entries.date), desc(entries.id)).limit(limit).all();
}

// ponytail: nets in JS over the full table — fine at scaffold scale. Upgrade to SQL aggregates
// (sum/count) if the ledger grows past what's cheap to load.
export function getNetFlow(db: Db): number {
  return getEntries(db).reduce((sum, r) => sum + r.amount, 0);
}

export type Summary = { net: number; inflow: number; outflow: number; count: number };

// Headline figures for the dashboard summary bar. inflow/outflow are split by sign so the UI
// can show where money came from vs went, not just the net.
export function getSummary(db: Db): Summary {
  return getEntries(db).reduce<Summary>(
    (acc, r) => ({
      net: acc.net + r.amount,
      inflow: acc.inflow + (r.amount > 0 ? r.amount : 0),
      outflow: acc.outflow + (r.amount < 0 ? r.amount : 0),
      count: acc.count + 1,
    }),
    { net: 0, inflow: 0, outflow: 0, count: 0 },
  );
}
