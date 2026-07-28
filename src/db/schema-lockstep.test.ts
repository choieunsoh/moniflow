import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { makeNodeProxyDb } from '@db/client';
import type { Db } from '@db/client';
import { ensureEntriesTable, ensureTripTitlesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureCurrenciesTable } from '@features/currencies/schema';

// THE documented drift hazard: the DDL lives in two hand-maintained places — each feature's
// ensure*Table (what the Node shim runs, so what every other test runs) and BOOTSTRAP_SQL in
// worker.ts (what actually ships). Nothing else in the suite can fail on drift, because the suite
// never executes BOOTSTRAP_SQL.
//
// This compares them by INTROSPECTION rather than by asserting hand-written column strings: it
// bootstraps one database each way and diffs sqlite's own PRAGMA output. That means a new table or
// column is covered the day it's added, with no third copy of the schema to keep in sync here.
function bootstrapStatements(): string[] {
  const worker = readFileSync('src/db/worker.ts', 'utf8');
  return [...worker.matchAll(/`(CREATE TABLE IF NOT EXISTS [\s\S]*?)`/g)].map((m) => m[1]);
}

function tableNameOf(statement: string): string {
  const match = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(statement);
  return match === null ? '' : match[1];
}

// Column name/type/NOT NULL/DEFAULT/PK, order-insensitive (cid dropped — it's just the ordinal).
async function columnFingerprint(db: Db, table: string): Promise<string[]> {
  const rows = await db.all<unknown[]>(sql.raw(`PRAGMA table_info(${table})`));
  return rows.map((r) => JSON.stringify(r.slice(1))).sort();
}

// UNIQUE constraints don't show up in table_info, and they're load-bearing here: the merge-by-name
// restore paths rely on categories.name / accounts.name being UNIQUE.
async function uniqueFingerprint(db: Db, table: string): Promise<string[]> {
  const indexes = await db.all<unknown[]>(sql.raw(`PRAGMA index_list(${table})`));
  const out: string[] = [];
  for (const index of indexes) {
    const name = index[1];
    if (index[2] !== 1 || typeof name !== 'string') continue;
    const info = await db.all<unknown[]>(sql.raw(`PRAGMA index_info("${name}")`));
    out.push(info.map((c) => JSON.stringify(c[2])).join(','));
  }
  return out.sort();
}

async function shippingDb(): Promise<Db> {
  const db = makeNodeProxyDb();
  for (const statement of bootstrapStatements()) await db.run(sql.raw(statement));
  return db;
}

async function featureDb(): Promise<Db> {
  const db = makeNodeProxyDb();
  await ensureEntriesTable(db);
  await ensureTripTitlesTable(db);
  await ensureCategoriesTable(db);
  await ensureAccountsTable(db);
  await ensureBudgetsTable(db);
  await ensureSettingsTable(db);
  await ensureRecurrencesTable(db);
  await ensureCurrenciesTable(db);
  return db;
}

const TABLES = [
  'entries',
  'categories',
  'accounts',
  'budgets',
  'settings',
  'trip_titles',
  'recurrences',
  'currencies',
];

describe('schema lockstep: BOOTSTRAP_SQL vs the ensure*Table functions', () => {
  it('BOOTSTRAP_SQL declares exactly the tables the features do', () => {
    expect(bootstrapStatements().map(tableNameOf).sort()).toEqual([...TABLES].sort());
  });

  it.each(TABLES)('%s has identical columns in both definitions', async (table) => {
    const [shipping, feature] = await Promise.all([shippingDb(), featureDb()]);
    expect(await columnFingerprint(shipping, table)).toEqual(
      await columnFingerprint(feature, table),
    );
  });

  it.each(TABLES)('%s has identical UNIQUE constraints in both definitions', async (table) => {
    const [shipping, feature] = await Promise.all([shippingDb(), featureDb()]);
    expect(await uniqueFingerprint(shipping, table)).toEqual(
      await uniqueFingerprint(feature, table),
    );
  });
});
