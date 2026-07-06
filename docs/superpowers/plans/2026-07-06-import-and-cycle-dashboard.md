# Monefy Import + Billing-Cycle Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import 10+ years of Monefy CSV history into the SQLite ledger, then view it through the user's 18th→17th credit-card billing cycle on a read-only dashboard.

**Architecture:** Two pure, unit-tested domain modules (`import.ts` for CSV parsing, `cycle.ts` for billing-cycle math) feed cycle-scoped drizzle queries. A CLI `import` command wires parsing → DB at the composition root; the dashboard server component reads a cycle from a URL param and renders summary + breakdowns. All work stays inside `src/features/entries/`; the dependency arrow stays `features → shared/db`.

**Tech Stack:** TypeScript (ESM, strict) · better-sqlite3 + drizzle-orm · commander · Next 16 App Router (React 19 server components) · Vitest.

---

## Conventions (read before starting)

- **Tests:** Vitest `describe/it/expect`; DB tests use `initDb(':memory:')` then `ensureEntriesTable(db)`.
- **TS bans (enforced as lint errors):** no `any`, no `as` casts, no `!`, no ts-comments. `as const` and `sql<T>` generics are allowed. Prefer `type` over `interface`, `for..of` over `forEach`.
- **Path aliases:** `@db/*`, `@features/*`, `@shared/*`.
- **Dates:** DB keys are `YYYY-MM-DD`; never do string surgery for *formatting* — use `Intl`. Parsing a fixed machine format (Monefy's `DD/MM/YYYY`) into numbers is fine.
- **Run a single test file:** `npm test -- src/features/entries/<file>.test.ts`
- **Imports stay at the top, merged:** when a step says "append a test" that imports from a module already imported in that file, add the new names to the existing `import { … } from './x'` line rather than writing a second import statement (avoids `import/first` and `import/no-duplicates` lint errors). Likewise, add new `import` lines only at the top of a source file.
- **Gates before every commit:** `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. All must pass.
- **Commit style:** `type(scope): subject` with `-m` body. Scopes here: `features`, `db`, `cli`, `app`. Footer lines:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/features/entries/schema.ts` | modify | Add `currency`, `original_amount` columns (drizzle table + DDL) |
| `src/features/entries/import.ts` | create | Pure: Monefy CSV text → `{ entries, skipped }` |
| `src/features/entries/import.test.ts` | create | Parser unit tests |
| `src/features/entries/cycle.ts` | create | Pure: 18→17 billing-cycle math |
| `src/features/entries/cycle.test.ts` | create | Cycle unit tests |
| `src/features/entries/queries.ts` | modify | Cycle-scoped reads + `replaceEntries` |
| `src/features/entries/queries.test.ts` | create | Query round-trip + range/grouping tests |
| `src/features/entries/breakdown.ts` | create | Pure: `toBars` proportional-bar helper |
| `src/features/entries/breakdown.test.ts` | create | `toBars` tests |
| `src/features/entries/ui/Breakdown.tsx` | create | Server component: category/account bar list |
| `src/features/entries/ui/CycleSelector.tsx` | create | Server component: prev/current/next links |
| `src/shared/date.ts` | modify | Add `todayIso()` (Bangkok) |
| `src/cli.ts` | modify | Wire `import <file>` command |
| `src/app/dashboard/page.tsx` | modify | Read `?cycle=`, render cycle-scoped views |

---

## Task 1: Schema — currency + original_amount columns

**Files:**
- Modify: `src/features/entries/schema.ts`
- Test: `src/features/entries/entries.test.ts` (extend)

- [ ] **Step 1: Write the failing test** — add to the existing `describe` block in `entries.test.ts`:

```ts
it('stores original currency + amount alongside the THB amount', () => {
  const db = initDb(':memory:');
  ensureEntriesTable(db);
  addEntries(db, [
    { date: '2026-07-01', account: 'jpy', category: 'food', amount: -230, currency: 'JPY', originalAmount: -1000 },
  ]);
  const [row] = getEntries(db);
  expect(row.currency).toBe('JPY');
  expect(row.originalAmount).toBe(-1000);
  expect(row.amount).toBe(-230); // THB, the rollup basis
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/entries.test.ts`
Expected: FAIL — TS error / `currency` not a known property.

- [ ] **Step 3: Add the columns** — in `src/features/entries/schema.ts`, extend the drizzle table and the `ensureEntriesTable` DDL. Full new file body:

```ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// The money-flow ledger — one row per inflow/outflow. `amount` is signed THB (the converted
// value) and is the basis for every rollup. `currency` + `originalAmount` preserve the source
// currency for non-THB rows (JPY/HKD) so the import is lossless; they are informational only.
// This file is the schema source of truth; after any edit here, re-run `npm run db:generate`.
export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(), // YYYY-MM-DD
  account: text('account').notNull(),
  category: text('category').notNull(),
  amount: real('amount').notNull(), // signed THB (converted)
  currency: text('currency'), // original currency, e.g. 'THB' | 'JPY'
  originalAmount: real('original_amount'), // signed amount in the original currency
  note: text('note'),
});

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;

// ponytail: scaffold bootstraps the table with CREATE TABLE IF NOT EXISTS instead of a
// drizzle-kit migration runner. Upgrade path when the schema stops being trivial: generate
// committed migrations (`npm run db:generate`) and replay them at the composition root.
export function ensureEntriesTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      account TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT,
      original_amount REAL,
      note TEXT
    )
  `);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/entries.test.ts`
Expected: PASS (both the original round-trip and the new currency test).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/schema.ts src/features/entries/entries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/schema.ts src/features/entries/entries.test.ts
git commit -m "feat(features): add currency + original_amount to entries schema" -m "Preserves the source currency of non-THB rows (JPY/HKD) so the upcoming Monefy import is lossless. Columns are nullable and informational; amount stays signed THB as the rollup basis." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 2: CSV field parser (pure)

Monefy quotes fields containing commas (e.g. `"12,000"`). A `cut`-style split is wrong; we need a real RFC-4180-ish splitter. Hand-rolled + tested; the format is regular so no dependency is warranted.

**Files:**
- Create: `src/features/entries/import.ts`
- Create: `src/features/entries/import.test.ts`

- [ ] **Step 1: Write the failing test** — `src/features/entries/import.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCsv } from './import';

describe('parseCsv', () => {
  it('splits simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields and strips the quotes', () => {
    expect(parseCsv('x,"12,000",y')).toEqual([['x', '12,000', 'y']]);
  });

  it('handles a trailing empty field and ignores blank lines', () => {
    expect(parseCsv('a,b,\n\n')).toEqual([['a', 'b', '']]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/import.test.ts`
Expected: FAIL — `parseCsv` not exported / module missing.

- [ ] **Step 3: Write minimal implementation** — create `src/features/entries/import.ts`:

```ts
// Pure Monefy-CSV → entries mapping. No DB, no fs — the CLI reads the file and calls this, which
// is what makes it unit-testable. The parser handles Monefy's quoting: fields with commas (money
// like "12,000") are double-quoted; embedded quotes are doubled ("").
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/import.ts src/features/entries/import.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/import.ts src/features/entries/import.test.ts
git commit -m "feat(features): add quoted-CSV field parser for Monefy import" -m "Hand-rolled RFC-4180-ish splitter so amounts like \"12,000\" survive intact — a cut/split would corrupt them. Pure and unit-tested; no dependency needed for a regular known format." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 3: Monefy row mapping + skip rule (pure)

Map columns → `NewEntry`, converting the date and cleaning amounts, and skip transfer/balance rows.

Monefy columns (0-indexed): `0 date · 1 account · 2 category · 3 amount(orig) · 4 currency(orig) · 5 converted_amount(THB) · 6 currency2 · 7 description`.

**Files:**
- Modify: `src/features/entries/import.ts`
- Modify: `src/features/entries/import.test.ts`

- [ ] **Step 1: Write the failing test** — append to `import.test.ts`:

```ts
import { parseMonefyCsv, SKIP_CATEGORIES } from './import';

describe('parseMonefyCsv', () => {
  const header = 'date,account,category,amount,currency,converted amount,currency,description';

  it('maps a THB outflow row: DD/MM/YYYY date, cleaned amount, note', () => {
    const csv = `${header}\n15/01/2016,#KTC X VISA,ช็อปปิ้ง,-637,THB,-637,THB,โลตัส`;
    const { entries, skipped } = parseMonefyCsv(csv);
    expect(skipped).toBe(0);
    expect(entries).toEqual([
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'ช็อปปิ้ง',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'โลตัส',
      },
    ]);
  });

  it('strips thousands commas and leaves an empty note as null', () => {
    const csv = `${header}\n16/01/2016,#KTC X VISA,รักษาพยาบาล,"-3,960",THB,"-3,960",THB,`;
    const [row] = parseMonefyCsv(csv).entries;
    expect(row.amount).toBe(-3960);
    expect(row.note).toBeNull();
  });

  it('keeps original currency + amount for a non-THB row', () => {
    const csv = `${header}\n20/03/2019,เงินเยน,เยน อาหาร,-1000,JPY,-230,THB,ramen`;
    const [row] = parseMonefyCsv(csv).entries;
    expect(row.currency).toBe('JPY');
    expect(row.originalAmount).toBe(-1000);
    expect(row.amount).toBe(-230); // converted THB
  });

  it('skips credit-card-payment and initial-balance rows', () => {
    const csv =
      `${header}\n` +
      `16/01/2016,#KTC X VISA,บัตรเครดิท,"12,000",THB,"12,000",THB,\n` +
      `01/01/2016,เงินเยน,Initial balance 'เงินเยน',5000,THB,5000,THB,`;
    const { entries, skipped } = parseMonefyCsv(csv);
    expect(entries).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it('exposes the skip list for review', () => {
    expect(SKIP_CATEGORIES).toContain('บัตรเครดิท');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/import.test.ts`
Expected: FAIL — `parseMonefyCsv` / `SKIP_CATEGORIES` not exported.

- [ ] **Step 3: Write the implementation** — first add `import type { NewEntry } from './schema';` to the **top** of `src/features/entries/import.ts` (imports must stay at the top), then append the rest below `parseCsv`:

```ts
// (top of file) import type { NewEntry } from './schema';

// Categories that are transfers/balances, not real money flow — dropped on import. Confirmed
// against the real export in Task 4; add entries here if that enumeration surfaces more.
export const SKIP_CATEGORIES = ['บัตรเครดิท'] as const;

export type ImportResult = { entries: NewEntry[]; skipped: number };

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

// 'DD/MM/YYYY' → 'YYYY-MM-DD'. Machine format: parse the numeric parts, then format via Intl
// (no string surgery for the output).
function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('/').map(Number);
  return isoFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

// '"-3,960"' has already lost its quotes in parseCsv → '-3,960'. Strip thousands commas, parse.
function cleanAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''));
}

function isSkippable(category: string): boolean {
  return SKIP_CATEGORIES.includes(category) || category.startsWith('Initial balance');
}

export function parseMonefyCsv(text: string): ImportResult {
  const rows = parseCsv(text);
  const body = rows.slice(1); // drop header
  const entries: NewEntry[] = [];
  let skipped = 0;
  for (const cols of body) {
    const category = cols[2];
    if (isSkippable(category)) {
      skipped += 1;
      continue;
    }
    const note = cols[7] ?? '';
    entries.push({
      date: toIsoDate(cols[0]),
      account: cols[1],
      category,
      amount: cleanAmount(cols[5]), // converted THB column
      currency: cols[4],
      originalAmount: cleanAmount(cols[3]),
      note: note === '' ? null : note,
    });
  }
  return { entries, skipped };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/import.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/import.ts src/features/entries/import.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/import.ts src/features/entries/import.test.ts
git commit -m "feat(features): map Monefy rows to entries with skip rule" -m "Converts DD/MM/YYYY dates, cleans thousands-comma amounts, keeps original currency + amount, and drops transfer/balance rows (credit-card payments, initial balances) per the spec." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 4: `replaceEntries` query + confirm skip list against the real file

Add the truncate-then-insert write used by import, then verify the skip list is complete.

**Files:**
- Modify: `src/features/entries/queries.ts`
- Create: `src/features/entries/queries.test.ts`

- [ ] **Step 1: Write the failing test** — `src/features/entries/queries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { addEntries, getEntries, replaceEntries } from './queries';

describe('replaceEntries', () => {
  it('wipes existing rows and inserts the new set', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [{ date: '2020-01-01', account: 'a', category: 'old', amount: -1 }]);
    replaceEntries(db, [
      { date: '2026-07-01', account: 'b', category: 'new', amount: -2 },
      { date: '2026-07-02', account: 'b', category: 'new', amount: -3 },
    ]);
    const rows = getEntries(db);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.category === 'new')).toBe(true);
  });

  it('clears to empty when given no rows', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [{ date: '2020-01-01', account: 'a', category: 'old', amount: -1 }]);
    replaceEntries(db, []);
    expect(getEntries(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — `replaceEntries` not exported.

- [ ] **Step 3: Implement** — add to `src/features/entries/queries.ts` (keep existing imports; add `entries` is already imported):

```ts
// Truncate-then-insert: the Monefy import replaces the whole ledger from an immutable export.
// Chunked inside a transaction — a 10k-row export would blow past SQLite's bound-variable limit in
// a single insert, and the delete + inserts must be atomic so a failure can't leave a half ledger.
// ponytail: safe while there is no write path. When the add-entry slice lands, add a `source`
// column and delete only where source='monefy' so hand-entered rows survive.
export function replaceEntries(db: Db, rows: NewEntry[]): void {
  const chunkSize = 500; // 500 rows × 7 bound columns stays well under SQLite's variable cap
  db.transaction((tx) => {
    tx.delete(entries).run();
    for (let i = 0; i < rows.length; i += chunkSize) {
      tx.insert(entries)
        .values(rows.slice(i, i + chunkSize))
        .run();
    }
  });
}
```

> **Scale note:** a single `insert().values(rows)` of the full ~10.7k-row export exceeds SQLite's
> bound-variable limit ("too many SQL variables"). The chunked, transactional form above is required;
> `queries.test.ts` includes a 1,500-row regression test proving it.

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the skip list against the real export** — run this ad-hoc enumeration of every category that appears on a positive (inflow) row, so we don't miss a transfer type:

Run:
```bash
npx tsx -e "import {readFileSync} from 'node:fs'; import {parseMonefyCsv} from './src/features/entries/import.ts'; const {entries,skipped}=parseMonefyCsv(readFileSync('data/Monefy.Data.05-07-2026.csv','utf8')); const pos=new Map(); for(const e of entries){ if(e.amount>0) pos.set(e.category,(pos.get(e.category)??0)+1);} console.log('skipped',skipped); console.log([...pos.entries()].sort((a,b)=>b[1]-a[1]));"
```
Expected: prints the skipped count and a list of categories still present on positive rows. **Review the list.** Genuine income/refunds may legitimately be positive and should stay. If a clear transfer/top-up category remains (e.g. cash or JPY account top-ups), add it to `SKIP_CATEGORIES` in `import.ts` and re-run. If the list is all plausible income, leave the skip list as-is. (No code change needed if nothing new surfaces.)

- [ ] **Step 6: Commit**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts src/features/entries/import.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/queries.ts src/features/entries/queries.test.ts src/features/entries/import.ts
git commit -m "feat(features): add replaceEntries and finalize import skip list" -m "replaceEntries truncates then inserts for the whole-ledger Monefy import. Skip list confirmed against the real export by enumerating positive-row categories." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 5: CLI `import` command

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add the command** — in `src/cli.ts`, add imports and a new command. New imports at top (alongside existing):

```ts
import { readFileSync } from 'node:fs';
import { parseMonefyCsv } from '@features/entries/import';
import { replaceEntries } from '@features/entries/queries';
```

Add this command block before `program.parse();`:

```ts
program
  .command('import <file>')
  .description('Replace the ledger with a Monefy CSV export')
  .option('--db <path>', 'SQLite path', process.env.MONIFLOW_DB ?? 'data/moniflow.db')
  .action((file: string, opts: { db: string }) => {
    const db = initDb(opts.db);
    ensureEntriesTable(db);
    const { entries, skipped } = parseMonefyCsv(readFileSync(file, 'utf8'));
    replaceEntries(db, entries);
    console.log(`imported ${entries.length}, skipped ${skipped} — run \`npm run dev:web\` and open /dashboard`);
  });
```

- [ ] **Step 2: Run it against the real export**

Run: `npm run dev -- import data/Monefy.Data.05-07-2026.csv`
Expected: prints e.g. `imported <N>, skipped <M> — …` with N in the thousands, no error.

- [ ] **Step 3: Sanity-check the DB**

Run: `npm run dev -- summary`
Expected: `<N> entries · net ฿…` — a plausible non-zero figure.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/cli.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/cli.ts
git commit -m "feat(cli): add import command for Monefy CSV export" -m "Wires parseMonefyCsv → replaceEntries at the composition root: reads the file, replaces the ledger, prints imported/skipped counts." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 6: Billing-cycle math (pure)

**Files:**
- Create: `src/features/entries/cycle.ts`
- Create: `src/features/entries/cycle.test.ts`

- [ ] **Step 1: Write the failing test** — `src/features/entries/cycle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cycleOf, cycleFromKey, currentCycleKey, stepKey } from './cycle';

describe('cycleOf (cutoff 18)', () => {
  it('a date on/after the 18th belongs to that month cycle', () => {
    expect(cycleOf('2026-07-18')).toEqual({
      key: '2026-07',
      start: '2026-07-18',
      end: '2026-08-17',
      label: '18 Jul – 17 Aug 2026',
    });
  });

  it('a date before the 18th belongs to the previous month cycle', () => {
    expect(cycleOf('2026-08-17').key).toBe('2026-07');
    expect(cycleOf('2026-08-17').end).toBe('2026-08-17');
  });

  it('rolls the year over at December', () => {
    expect(cycleOf('2027-01-05')).toEqual({
      key: '2026-12',
      start: '2026-12-18',
      end: '2027-01-17',
      label: '18 Dec 2026 – 17 Jan 2027',
    });
  });
});

describe('cycleFromKey / stepKey / currentCycleKey', () => {
  it('builds a cycle from its key', () => {
    expect(cycleFromKey('2026-07').start).toBe('2026-07-18');
  });

  it('steps month keys forward and back, across year boundaries', () => {
    expect(stepKey('2026-07', 1)).toBe('2026-08');
    expect(stepKey('2026-01', -1)).toBe('2025-12');
    expect(stepKey('2026-12', 1)).toBe('2027-01');
  });

  it('derives the current cycle key from today', () => {
    expect(currentCycleKey('2026-07-06')).toBe('2026-06');
    expect(currentCycleKey('2026-07-18')).toBe('2026-07');
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/cycle.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — create `src/features/entries/cycle.ts`:

```ts
// Billing-cycle math for the money-flow dashboard. Pure, no DB. The user's credit card cuts off
// on the 18th, so a "cycle" runs the 18th → the 17th of the next month and is anchored (keyed) to
// its START month. One global cutoff for now; per-card cutoffs are a later slice.
export const CUTOFF = 18;

export type Cycle = { key: string; start: string; end: string; label: string };

const dmUtc = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const isoUtc = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' });

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatRange(start: Date, end: Date): string {
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  const startStr = sy === ey ? dmUtc.format(start) : `${dmUtc.format(start)} ${sy}`;
  return `${startStr} – ${dmUtc.format(end)} ${ey}`;
}

// startY/startM (1-based month) → the full cycle beginning on the cutoff of that month.
function buildCycle(startY: number, startM: number, cutoff: number): Cycle {
  const startDate = new Date(Date.UTC(startY, startM - 1, cutoff));
  const endDate = new Date(Date.UTC(startY, startM, cutoff - 1)); // next month, 17th; rolls year
  return {
    key: `${startY}-${pad2(startM)}`,
    start: isoUtc.format(startDate),
    end: isoUtc.format(endDate),
    label: formatRange(startDate, endDate),
  };
}

export function cycleOf(iso: string, cutoff = CUTOFF): Cycle {
  const [y, m, d] = iso.split('-').map(Number);
  return d >= cutoff ? buildCycle(y, m, cutoff) : buildCycle(...stepYM(y, m, -1), cutoff);
}

export function cycleFromKey(key: string, cutoff = CUTOFF): Cycle {
  const [y, m] = key.split('-').map(Number);
  return buildCycle(y, m, cutoff);
}

export function currentCycleKey(todayIso: string, cutoff = CUTOFF): string {
  return cycleOf(todayIso, cutoff).key;
}

export function stepKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const [ny, nm] = stepYM(y, m, delta);
  return `${ny}-${pad2(nm)}`;
}

// (year, 1-based month) shifted by delta months, normalized. Returned as a tuple for buildCycle.
function stepYM(y: number, m: number, delta: number): [number, number] {
  const total = y * 12 + (m - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/cycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/cycle.ts src/features/entries/cycle.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/cycle.ts src/features/entries/cycle.test.ts
git commit -m "feat(features): add 18-17 billing-cycle math" -m "Pure cycleOf/cycleFromKey/stepKey/currentCycleKey. Cycles run the 18th to the 17th, are keyed to the start month (YYYY-MM), and label as a range (18 Jul – 17 Aug 2026), with year shown on both ends when the cycle crosses a year." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 7: Cycle-scoped queries

Add range-filtered reads. Refactor the existing `getSummary` to share a `summarize` reducer (DRY) so the cycle summary reuses it.

**Files:**
- Modify: `src/features/entries/queries.ts`
- Modify: `src/features/entries/queries.test.ts`

- [ ] **Step 1: Write the failing test** — append to `queries.test.ts`:

```ts
import {
  getCycleSummary,
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
} from './queries';

describe('cycle-scoped queries', () => {
  function seed() {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-17', account: 'visa', category: 'food', amount: -100 }, // before cycle
      { date: '2026-07-18', account: 'visa', category: 'food', amount: -200 },
      { date: '2026-07-20', account: 'cash', category: 'food', amount: -50 },
      { date: '2026-08-01', account: 'visa', category: 'travel', amount: -300 },
      { date: '2026-08-18', account: 'visa', category: 'food', amount: -999 }, // next cycle
    ]);
    return db;
  }

  it('summarizes only rows within [start, end]', () => {
    const s = getCycleSummary(seed(), '2026-07-18', '2026-08-17');
    expect(s).toEqual({ net: -550, inflow: 0, outflow: -550, count: 3 });
  });

  it('breaks down by category, largest magnitude first', () => {
    const b = getCategoryBreakdown(seed(), '2026-07-18', '2026-08-17');
    expect(b).toEqual([
      { key: 'travel', total: -300 },
      { key: 'food', total: -250 },
    ]);
  });

  it('breaks down by account', () => {
    const b = getAccountBreakdown(seed(), '2026-07-18', '2026-08-17');
    expect(b).toEqual([
      { key: 'visa', total: -500 },
      { key: 'cash', total: -50 },
    ]);
  });

  it('returns the raw entries in range', () => {
    expect(getEntriesInRange(seed(), '2026-07-18', '2026-08-17')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Implement** — update `src/features/entries/queries.ts`. Change the top import line to add the operators, refactor `getSummary`, and append the new functions:

Replace the first import line:
```ts
import { desc, and, gte, lte, sql } from 'drizzle-orm';
```

Refactor `getSummary` to reuse a shared reducer (replace the existing `getSummary` body):
```ts
function summarize(rows: Entry[]): Summary {
  return rows.reduce<Summary>(
    (acc, r) => ({
      net: acc.net + r.amount,
      inflow: acc.inflow + (r.amount > 0 ? r.amount : 0),
      outflow: acc.outflow + (r.amount < 0 ? r.amount : 0),
      count: acc.count + 1,
    }),
    { net: 0, inflow: 0, outflow: 0, count: 0 },
  );
}

export function getSummary(db: Db): Summary {
  return summarize(getEntries(db));
}
```

Append the cycle-scoped reads:
```ts
export type Breakdown = { key: string; total: number };

export function getEntriesInRange(db: Db, start: string, end: string): Entry[] {
  return db
    .select()
    .from(entries)
    .where(and(gte(entries.date, start), lte(entries.date, end)))
    .all();
}

export function getCycleSummary(db: Db, start: string, end: string): Summary {
  return summarize(getEntriesInRange(db, start, end));
}

// GROUP BY in SQL so a cycle view never loads the full 10-year ledger. Sorted by magnitude in JS
// (the result set is at most one row per category/account — tiny).
function groupSum(
  db: Db,
  column: typeof entries.category | typeof entries.account,
  start: string,
  end: string,
): Breakdown[] {
  return db
    .select({ key: column, total: sql<number>`sum(${entries.amount})` })
    .from(entries)
    .where(and(gte(entries.date, start), lte(entries.date, end)))
    .groupBy(column)
    .all()
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

export function getCategoryBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return groupSum(db, entries.category, start, end);
}

export function getAccountBreakdown(db: Db, start: string, end: string): Breakdown[] {
  return groupSum(db, entries.account, start, end);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS. Also run the whole suite so the refactor didn't break `entries.test.ts`:
Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): add cycle-scoped summary and breakdown queries" -m "Range-filtered getCycleSummary/getCategoryBreakdown/getAccountBreakdown/getEntriesInRange using SQL WHERE + GROUP BY. getSummary refactored to share a summarize() reducer (DRY)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 8: `toBars` breakdown helper (pure) + `todayIso`

**Files:**
- Create: `src/features/entries/breakdown.ts`
- Create: `src/features/entries/breakdown.test.ts`
- Modify: `src/shared/date.ts`

- [ ] **Step 1: Write the failing tests** — `src/features/entries/breakdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toBars } from './breakdown';

describe('toBars', () => {
  it('scales each row to a 0–100 pct of the largest magnitude', () => {
    expect(toBars([{ key: 'a', total: -300 }, { key: 'b', total: -150 }])).toEqual([
      { key: 'a', total: -300, pct: 100 },
      { key: 'b', total: -150, pct: 50 },
    ]);
  });

  it('returns an empty array unchanged (no divide-by-zero)', () => {
    expect(toBars([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/breakdown.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** — create `src/features/entries/breakdown.ts`:

```ts
import type { Breakdown } from './queries';

export type Bar = Breakdown & { pct: number };

// Proportional bar widths for the dashboard breakdown list. pct is relative to the largest
// magnitude in the set, so the top row always fills the track. Pure — the UI just renders widths.
export function toBars(items: Breakdown[]): Bar[] {
  const max = Math.max(0, ...items.map((i) => Math.abs(i.total)));
  return items.map((i) => ({ ...i, pct: max === 0 ? 0 : (Math.abs(i.total) / max) * 100 }));
}
```

- [ ] **Step 4: Add `todayIso`** — append to `src/shared/date.ts`:

```ts
// Today as a 'YYYY-MM-DD' key in Bangkok — the zone the ledger's cycles are reckoned in. Used by
// the dashboard to pick the default (current) cycle.
const isoBangkok = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

export function todayIso(): string {
  return isoBangkok.format(new Date());
}
```

- [ ] **Step 5: Run it, verify it passes**

Run: `npm test -- src/features/entries/breakdown.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run format:files src/features/entries/breakdown.ts src/features/entries/breakdown.test.ts src/shared/date.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/breakdown.ts src/features/entries/breakdown.test.ts src/shared/date.ts
git commit -m "feat(features): add toBars breakdown helper and todayIso" -m "toBars scales breakdown rows to proportional bar widths (pure, tested). todayIso gives the Bangkok current-day key for the dashboard's default cycle." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 9: `Breakdown` and `CycleSelector` UI components

Server components (no client JS). Follow `SummaryBar.tsx` styling conventions (`panel`, CSS token vars, `formatBaht`).

**Files:**
- Create: `src/features/entries/ui/Breakdown.tsx`
- Create: `src/features/entries/ui/CycleSelector.tsx`

- [ ] **Step 1: Create `Breakdown.tsx`**:

```tsx
import { formatBaht } from '@shared/money';
import { toBars } from '../breakdown';
import type { Breakdown as BreakdownRow } from '../queries';

// A ranked bar list — outflow-heavy categories/accounts read at a glance. Magnitudes only (spending
// is negative); the bar width is relative to the biggest row in the set.
export function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  const bars = toBars(rows);
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {bars.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Nothing in this cycle.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {bars.map((b) => (
            <li key={b.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span>{b.key}</span>
                <span className="tnum" style={{ color: 'var(--color-text)' }}>
                  {formatBaht(Math.abs(b.total))}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded" style={{ background: 'var(--color-border)' }}>
                <div
                  className="h-full rounded"
                  style={{ width: `${b.pct}%`, background: 'var(--color-accent)' }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create `CycleSelector.tsx`**:

```tsx
import Link from 'next/link';
import { cycleFromKey, stepKey } from '../cycle';

// Prev / current / next cycle navigation. Pure links that swap the ?cycle= param and re-render the
// server component — no client state. The center shows the active cycle's range label.
export function CycleSelector({ activeKey }: { activeKey: string }) {
  const active = cycleFromKey(activeKey);
  const prev = stepKey(activeKey, -1);
  const next = stepKey(activeKey, 1);
  return (
    <nav className="panel flex items-center justify-between p-3">
      <Link href={`?cycle=${prev}`} className="rounded px-3 py-1 text-sm hover:underline">
        ← {cycleFromKey(prev).label}
      </Link>
      <span className="text-sm font-semibold">{active.label}</span>
      <Link href={`?cycle=${next}`} className="rounded px-3 py-1 text-sm hover:underline">
        {cycleFromKey(next).label} →
      </Link>
    </nav>
  );
}
```

- [ ] **Step 3: Typecheck + lint** (no unit test — presentational; verified via the page in Task 10)

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/features/entries/ui/Breakdown.tsx src/features/entries/ui/CycleSelector.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/Breakdown.tsx src/features/entries/ui/CycleSelector.tsx
git commit -m "feat(app): add Breakdown and CycleSelector dashboard components" -m "Server components, no client JS: Breakdown renders a ranked proportional-bar list; CycleSelector navigates prev/current/next cycles via ?cycle= links." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 10: Wire the dashboard to the selected cycle

Rewrite `dashboard/page.tsx` to read `?cycle=` (default = current), resolve the range, and render cycle-scoped views. In Next 16 App Router, `searchParams` is a Promise and must be awaited.

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Rewrite the page** — full new `src/app/dashboard/page.tsx`:

```tsx
// Reads the local SQLite DB per request (better-sqlite3 can't be prerendered, and the ledger is
// live data), so opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import {
  getCycleSummary,
  getCategoryBreakdown,
  getAccountBreakdown,
  getEntriesInRange,
} from '@features/entries/queries';
import { cycleFromKey, currentCycleKey } from '@features/entries/cycle';
import { todayIso } from '@shared/date';
import { SummaryBar } from '@features/entries/ui/SummaryBar';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { LedgerTable } from '@features/entries/ui/LedgerTable';
import { EmptyLedger } from '@features/entries/ui/EmptyLedger';
import { FlowChart } from '@features/entries/ui/FlowChart';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const { cycle: cycleParam } = await searchParams;
  const db = initDb();
  ensureEntriesTable(db);

  const activeKey = cycleParam ?? currentCycleKey(todayIso());
  const cycle = cycleFromKey(activeKey);
  const summary = getCycleSummary(db, cycle.start, cycle.end);
  const entriesInCycle = getEntriesInRange(db, cycle.start, cycle.end);

  return (
    <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Your money flow for the {cycle.label} billing cycle.
        </p>
      </header>

      <CycleSelector activeKey={activeKey} />

      {summary.count > 0 ? (
        <>
          <SummaryBar summary={summary} />
          <div className="grid gap-6 md:grid-cols-2">
            <Breakdown title="By category" rows={getCategoryBreakdown(db, cycle.start, cycle.end)} />
            <Breakdown title="By account" rows={getAccountBreakdown(db, cycle.start, cycle.end)} />
          </div>
          <section className="panel p-5">
            <h2 className="mb-4 text-base font-semibold">Balance over the cycle</h2>
            <FlowChart entries={entriesInCycle} />
          </section>
          <LedgerTable entries={entriesInCycle.slice(-8).reverse()} />
        </>
      ) : (
        <EmptyLedger />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to catch type/route errors**

Run: `npm run build:web`
Expected: build succeeds (compiles `/dashboard`), no type errors.

- [ ] **Step 3: Verify in the running app** — with the import already loaded (Task 5):

Run: `npm run dev:web` (then, in another shell or a browser) open `http://127.0.0.1:4001/dashboard`
Expected: the current cycle shows a SummaryBar with a non-zero outflow, By-category and By-account bars, a balance chart, and a recent-entries table. Click the prev/next links — the label changes to `18 <Mon> – 17 <Mon> <year>` and the figures change. Try `?cycle=2019-03` (a JPY-trip month) — Japan categories appear. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/dashboard/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/dashboard/page.tsx
git commit -m "feat(app): scope the dashboard to a selectable billing cycle" -m "Dashboard reads ?cycle= (default current), resolves the 18-17 range, and renders cycle-scoped summary, by-category/by-account breakdowns, balance chart, and recent entries. CycleSelector navigates between cycles." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 11: Cycle-progress meter

A small "Day X of Y" indicator for the active cycle. Full budget-vs-pace comparison waits for the budgets slice — this is calendar progress only.

**Files:**
- Modify: `src/features/entries/cycle.ts`
- Modify: `src/features/entries/cycle.test.ts`
- Create: `src/features/entries/ui/CycleProgress.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Write the failing test** — append to `cycle.test.ts`:

```ts
import { cycleProgress } from './cycle';

describe('cycleProgress', () => {
  it('reports the 1-based day within the cycle and its length', () => {
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-07-18')).toEqual({ day: 1, total: 31 });
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-07-20')).toEqual({ day: 3, total: 31 });
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-08-17')).toEqual({ day: 31, total: 31 });
  });

  it('clamps a date outside the cycle into range', () => {
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-09-01').day).toBe(31);
    expect(cycleProgress(cycleFromKey('2026-07'), '2026-01-01').day).toBe(1);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/cycle.test.ts`
Expected: FAIL — `cycleProgress` not exported.

- [ ] **Step 3: Implement** — append to `src/features/entries/cycle.ts`:

```ts
export type Progress = { day: number; total: number };

const DAY_MS = 86_400_000;

function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(`${bIso}T00:00:00Z`) - Date.parse(`${aIso}T00:00:00Z`)) / DAY_MS);
}

// 1-based day of `todayIso` within the cycle, and the cycle's length in days. Clamped so an
// out-of-range date (viewing a past/future cycle) still renders a sane meter.
export function cycleProgress(cycle: Cycle, todayIso: string): Progress {
  const total = daysBetween(cycle.start, cycle.end) + 1;
  const raw = daysBetween(cycle.start, todayIso) + 1;
  return { day: Math.min(total, Math.max(1, raw)), total };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/cycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `CycleProgress.tsx`**:

```tsx
import type { Progress } from '../cycle';

// Calendar position within the cycle — "Day 12 of 31" with a thin track. Not a budget gauge (that
// arrives with the budgets slice); this just anchors how far through the cycle you are.
export function CycleProgress({ progress }: { progress: Progress }) {
  const pct = (progress.day / progress.total) * 100;
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <div className="flex justify-between text-sm" style={{ color: 'var(--color-muted)' }}>
        <span>Cycle progress</span>
        <span className="tnum">
          Day {progress.day} of {progress.total}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded" style={{ background: 'var(--color-border)' }}>
        <div className="h-full rounded" style={{ width: `${pct}%`, background: 'var(--color-accent)' }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire it into the page** — in `src/app/dashboard/page.tsx`:

Add imports:
```tsx
import { cycleFromKey, currentCycleKey, cycleProgress } from '@features/entries/cycle';
import { CycleProgress } from '@features/entries/ui/CycleProgress';
```
(the `cycleFromKey, currentCycleKey` import line replaces the existing one).

Render `<CycleProgress>` directly under `<CycleSelector>`:
```tsx
      <CycleSelector activeKey={activeKey} />
      <CycleProgress progress={cycleProgress(cycle, todayIso())} />
```

- [ ] **Step 7: Verify build + suite**

Run: `npm run build:web && npm test`
Expected: build succeeds, all tests PASS.

- [ ] **Step 8: Commit**

```bash
npm run format:files src/features/entries/cycle.ts src/features/entries/cycle.test.ts src/features/entries/ui/CycleProgress.tsx src/app/dashboard/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/cycle.ts src/features/entries/cycle.test.ts src/features/entries/ui/CycleProgress.tsx src/app/dashboard/page.tsx
git commit -m "feat(app): add cycle-progress meter to the dashboard" -m "cycleProgress computes the 1-based day within the cycle (clamped for out-of-range views); CycleProgress renders Day X of Y. Calendar progress only — budget pace lands with the budgets slice." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Done — definition of complete

- `npm run dev -- import data/Monefy.Data.05-07-2026.csv` loads the export (thousands of rows, some skipped).
- `/dashboard` opens on the current 18→17 cycle; prev/next navigate cycles; category + account breakdowns, balance chart, recent entries, and a Day-X-of-Y meter all render.
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web` all pass.
- All new domain logic (`import`, `cycle`, `breakdown`, cycle queries) is unit-tested.

## Deferred (explicitly not in this slice)

Add/edit entry form · budgets (set + track) · category merge/alias tool · trip/JPY view · per-card cutoff days · auto FX lookup · switching import off truncate-reload (needs a `source` column once a write path exists).
