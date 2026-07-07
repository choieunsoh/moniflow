# Configurable Global Cutoff (Settings) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user change the one global billing-cycle cutoff day (currently hardcoded at 18)
through a `/settings` page, and thread the stored value through the dashboard so cycles are
computed against it instead of the constant.

**Architecture:** A new `settings` feature owns a generic key-value table (`schema.ts`), typed
reads/writes for the single `cutoff_day` key plus a pure validator (`queries.ts`), and a Server
Action (`actions.ts`) that validates and persists a submitted value. `entries/cycle.ts` needs no
changes — it already takes an optional `cutoff` parameter on every function, defaulting to
`CUTOFF = 18`. `CycleSelector` and `dashboard/page.tsx` are edited to read the stored cutoff and
pass it through explicitly instead of relying on that default. `settings` and `entries` do not
import from each other — the dashboard route composes both.

**Tech Stack:** TypeScript (ESM, strict) · better-sqlite3 + drizzle-orm · Next 16 App Router
(React 19 server components + Server Actions) · Vitest.

---

## Conventions (read before starting)

- **Tests:** Vitest `describe/it/expect`; DB tests use `initDb(':memory:')` then the feature's
  `ensure*Table(db)`.
- **TS bans (enforced as lint errors):** no `any`, no `as` casts, no `!`, no ts-comments. `as
  const` and `sql<T>` generics are allowed. Prefer `type` over `interface`, `for..of` over
  `forEach`.
- **Path aliases:** `@db/*`, `@features/*`, `@shared/*`.
- **Run a single test file:** `npm test -- src/features/settings/<file>.test.ts`
- **Imports stay at the top, merged:** when a step says "append a test" that imports from a module
  already imported in that file, add the new names to the existing `import { … } from './x'` line
  rather than writing a second import statement (avoids `import/first` and `import/no-duplicates`
  lint errors). Likewise, add new `import` lines only at the top of a source file.
- **Gates before every commit:** `npm run format:files <changed>` → `npm run typecheck` → `npm run
  lint` → `npm run format:check` → `npm test`. All must pass.
- **Commit style:** `type(scope): subject` with `-m` body. Scopes here: `features`, `app`. Footer
  lines:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/features/settings/schema.ts` | create | KV `settings` table + `ensureSettingsTable(db)` + `Setting` type |
| `src/features/settings/schema.test.ts` | create | DDL round-trip test |
| `src/features/settings/queries.ts` | create | `getCutoff` / `setCutoff` / `isValidCutoffDay` |
| `src/features/settings/queries.test.ts` | create | default / round-trip / overwrite / validator tests |
| `src/features/settings/actions.ts` | create | `'use server'` — `setCutoffAction(formData)` |
| `src/features/entries/ui/CycleSelector.tsx` | modify | accept + thread a `cutoff: number` prop |
| `src/app/dashboard/page.tsx` | modify | read `getCutoff(db)`, thread it through cycle calls |
| `src/app/settings/page.tsx` | create | server component: cutoff form |
| `src/shared/ui/Nav.tsx` | modify | add the `/settings` nav link |

---

## Task 1: Settings schema — KV table + `ensureSettingsTable`

**Files:**
- Create: `src/features/settings/schema.ts`
- Create: `src/features/settings/schema.test.ts`

- [ ] **Step 1: Write the failing test** — `src/features/settings/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureSettingsTable, settings } from './schema';

describe('ensureSettingsTable', () => {
  it('creates a key/value table a row can be inserted into and read back', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    db.insert(settings).values({ key: 'cutoff_day', value: '18' }).run();
    const [row] = db.select().from(settings).all();
    expect(row).toEqual({ key: 'cutoff_day', value: '18' });
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/settings/schema.test.ts`
Expected: FAIL — `./schema` module missing.

- [ ] **Step 3: Implement** — create `src/features/settings/schema.ts`:

```ts
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { Db } from '@db/client';

// Generic key-value settings store — deliberately not cutoff-specific, so future single-value
// settings (currency display, theme, …) reuse this table instead of each needing its own
// migration. This slice only ever writes one key: 'cutoff_day'.
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Setting = typeof settings.$inferSelect;

// ponytail: CREATE TABLE IF NOT EXISTS bootstrap, same pattern as ensureEntriesTable — no
// migration runner yet. Upgrade path: `npm run db:generate` + replay at the composition root once
// the schema stops being trivial.
export function ensureSettingsTable(db: Db): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/settings/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/schema.ts src/features/settings/schema.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/settings/schema.ts src/features/settings/schema.test.ts
git commit -m "feat(features): add settings key-value schema" -m "Generic key/value table for single-value app settings, starting with the billing cutoff day. Bootstrapped with CREATE TABLE IF NOT EXISTS, same pattern as the entries schema." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 2: `getCutoff` / `setCutoff` / `isValidCutoffDay`

**Files:**
- Create: `src/features/settings/queries.ts`
- Create: `src/features/settings/queries.test.ts`

- [ ] **Step 1: Write the failing test** — `src/features/settings/queries.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { initDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { getCutoff, setCutoff, isValidCutoffDay } from './queries';

describe('getCutoff / setCutoff', () => {
  it('defaults to 18 when no cutoff has been stored', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    expect(getCutoff(db)).toBe(18);
  });

  it('round-trips a stored cutoff', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    setCutoff(db, 25);
    expect(getCutoff(db)).toBe(25);
  });

  it('overwrites rather than duplicating on a second write', () => {
    const db = initDb(':memory:');
    ensureSettingsTable(db);
    setCutoff(db, 25);
    setCutoff(db, 5);
    expect(getCutoff(db)).toBe(5);
  });
});

describe('isValidCutoffDay', () => {
  it('accepts integers in 1..28', () => {
    expect(isValidCutoffDay(1)).toBe(true);
    expect(isValidCutoffDay(18)).toBe(true);
    expect(isValidCutoffDay(28)).toBe(true);
  });

  it('rejects 0, 29, non-integers, and NaN', () => {
    expect(isValidCutoffDay(0)).toBe(false);
    expect(isValidCutoffDay(29)).toBe(false);
    expect(isValidCutoffDay(18.5)).toBe(false);
    expect(isValidCutoffDay(Number.NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: FAIL — `./queries` module missing.

- [ ] **Step 3: Implement** — create `src/features/settings/queries.ts`:

```ts
import { eq } from 'drizzle-orm';
import type { Db } from '@db/client';
import { settings } from './schema';

const CUTOFF_KEY = 'cutoff_day';
// Intentionally a plain literal, not imported from entries/cycle.ts's CUTOFF constant — settings
// and entries don't depend on each other (see the design doc's dependency-rule note). Both equal
// 18 because that happens to be the user's real cutoff today, not because they're coupled.
const DEFAULT_CUTOFF = 18;

// Falls back to DEFAULT_CUTOFF for a fresh DB, or one that predates this feature — upgrading is
// invisible until the user opts into changing it via /settings.
export function getCutoff(db: Db): number {
  const [row] = db.select().from(settings).where(eq(settings.key, CUTOFF_KEY)).all();
  return row === undefined ? DEFAULT_CUTOFF : Number(row.value);
}

// Upsert via delete-then-insert inside a transaction — mirrors the replaceEntries pattern already
// used in entries/queries.ts. Simpler than onConflictDoUpdate for a single-row key.
export function setCutoff(db: Db, day: number): void {
  db.transaction((tx) => {
    tx.delete(settings).where(eq(settings.key, CUTOFF_KEY)).run();
    tx.insert(settings)
      .values({ key: CUTOFF_KEY, value: String(day) })
      .run();
  });
}

// Pure validator, reused by the Server Action so the 1..28 rule lives in exactly one place. 28 is
// the ceiling because every month has at least 28 days — 29/30/31 would be ambiguous or
// impossible in some months.
export function isValidCutoffDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 28;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/settings/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/queries.ts src/features/settings/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/settings/queries.ts src/features/settings/queries.test.ts
git commit -m "feat(features): add cutoff getters/setter and 1-28 validator" -m "getCutoff falls back to 18 (Slice 1's hardcoded value) when unset; setCutoff upserts via delete-then-insert; isValidCutoffDay is a pure, independently tested 1..28 range check reused by the upcoming Server Action." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 3: `setCutoffAction` Server Action

No automated test — Server Actions that call `revalidatePath` aren't practical to exercise under
Vitest without mocking `next/cache`; this repo verifies Server Actions and CLI commands manually
end-to-end instead (see Task 6's manual verification step, and the CLI `import` command's
precedent in the import-and-cycle-dashboard plan).

**Files:**
- Create: `src/features/settings/actions.ts`

- [ ] **Step 1: Implement** — create `src/features/settings/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureSettingsTable } from './schema';
import { setCutoff, isValidCutoffDay } from './queries';

// Server Action backing the /settings form. Validates before writing (the <input min/max> only
// constrains well-behaved browsers — this is the real guard), then revalidates both pages that
// read the cutoff so a fresh visit reflects the change immediately.
export async function setCutoffAction(formData: FormData): Promise<void> {
  const raw = formData.get('day');
  const day = Number(raw);
  if (!isValidCutoffDay(day)) {
    throw new Error(`Cutoff day must be an integer between 1 and 28, got: ${String(raw)}`);
  }
  const db = initDb();
  ensureSettingsTable(db);
  setCutoff(db, day);
  revalidatePath('/dashboard');
  revalidatePath('/settings');
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS. (Behavior is verified end-to-end in Task 6, once the `/settings` form exists to
drive it.)

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/settings/actions.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/settings/actions.ts
git commit -m "feat(features): add setCutoffAction server action" -m "Validates the submitted day against isValidCutoffDay, persists it via setCutoff, and revalidates /dashboard + /settings so both reflect the change on next visit." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 4: `CycleSelector` accepts a `cutoff` prop

`CycleSelector` currently calls `cycleFromKey(key)` three times, relying on the default `cutoff =
CUTOFF` (18) baked into `cycle.ts`. Once the cutoff is configurable, the selector must use the same
value the rest of the page uses, or its labels would drift out of sync whenever the user changes
the cutoff away from 18.

**Files:**
- Modify: `src/features/entries/ui/CycleSelector.tsx`

- [ ] **Step 1: Update the component** — full new `src/features/entries/ui/CycleSelector.tsx`:

```tsx
import Link from 'next/link';
import { cycleFromKey, stepKey } from '../cycle';

// Prev / current / next cycle navigation. Pure links that swap the ?cycle= param and re-render the
// server component — no client state. `cutoff` is required (no default): it must match whatever
// the caller resolved from settings, or the labels here would drift from the rest of the page.
export function CycleSelector({ activeKey, cutoff }: { activeKey: string; cutoff: number }) {
  const active = cycleFromKey(activeKey, cutoff);
  const prev = stepKey(activeKey, -1);
  const next = stepKey(activeKey, 1);
  return (
    <nav className="panel flex items-center justify-between p-3">
      <Link href={`?cycle=${prev}`} className="rounded px-3 py-1 text-sm hover:underline">
        ← {cycleFromKey(prev, cutoff).label}
      </Link>
      <span className="text-sm font-semibold">{active.label}</span>
      <Link href={`?cycle=${next}`} className="rounded px-3 py-1 text-sm hover:underline">
        {cycleFromKey(next, cutoff).label} →
      </Link>
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: FAILS at this point — `src/app/dashboard/page.tsx` still calls `<CycleSelector
activeKey={activeKey} />` without the now-required `cutoff` prop. This is expected; Task 5 fixes
the call site. Confirm the error is exactly the missing-prop error on that one call site (nothing
else broken) before moving on.

- [ ] **Step 3: Commit**

Committed together with Task 5, since the dashboard call site must change in the same commit to
keep `typecheck` green at each commit boundary. Skip standalone commit here — proceed directly to
Task 5.

---

## Task 5: Wire the stored cutoff into the dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Update the page** — full new `src/app/dashboard/page.tsx`:

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
import { cycleFromKey, currentCycleKey, cycleProgress } from '@features/entries/cycle';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { todayIso } from '@shared/date';
import { SummaryBar } from '@features/entries/ui/SummaryBar';
import { Breakdown } from '@features/entries/ui/Breakdown';
import { CycleSelector } from '@features/entries/ui/CycleSelector';
import { CycleProgress } from '@features/entries/ui/CycleProgress';
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
  ensureSettingsTable(db);

  const cutoff = getCutoff(db);
  const activeKey = cycleParam ?? currentCycleKey(todayIso(), cutoff);
  const cycle = cycleFromKey(activeKey, cutoff);
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

      <CycleSelector activeKey={activeKey} cutoff={cutoff} />
      <CycleProgress progress={cycleProgress(cycle, todayIso())} />

      {summary.count > 0 ? (
        <>
          <SummaryBar summary={summary} />
          <div className="grid gap-6 md:grid-cols-2">
            <Breakdown
              title="By category"
              rows={getCategoryBreakdown(db, cycle.start, cycle.end)}
            />
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

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build:web`
Expected: PASS — the `CycleSelector` prop error from Task 4 is now resolved.

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev:web`, open `http://127.0.0.1:4010/dashboard`. Expected: renders exactly as
before (cutoff still resolves to 18 — no settings row exists yet, so `getCutoff` falls back to the
default). Stop the dev server when done.

- [ ] **Step 4: Commit** (covers Task 4 + Task 5 together, per the note above)

```bash
npm run format:files src/features/entries/ui/CycleSelector.tsx src/app/dashboard/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/ui/CycleSelector.tsx src/app/dashboard/page.tsx
git commit -m "feat(app): thread the stored cutoff through CycleSelector and the dashboard" -m "CycleSelector now requires an explicit cutoff prop instead of relying on cycle.ts's default, so its labels can't drift from the rest of the page. The dashboard reads getCutoff(db) (defaulting to 18 until a value is stored) and passes it to currentCycleKey/cycleFromKey/CycleSelector." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 6: `/settings` page + nav link

**Files:**
- Create: `src/app/settings/page.tsx`
- Modify: `src/shared/ui/Nav.tsx`

- [ ] **Step 1: Create the settings page** — `src/app/settings/page.tsx`:

```tsx
// Reads the local SQLite DB per request, same as /dashboard — opt out of static generation.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureSettingsTable } from '@features/settings/schema';
import { getCutoff } from '@features/settings/queries';
import { setCutoffAction } from '@features/settings/actions';

export default function SettingsPage() {
  const db = initDb();
  ensureSettingsTable(db);
  const cutoff = getCutoff(db);

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          One global billing-cycle cutoff applies across every account.
        </p>
      </header>

      <section className="panel flex flex-col gap-4 p-5">
        <form action={setCutoffAction} className="flex flex-col gap-3">
          <label htmlFor="day" className="text-sm font-medium">
            Billing cutoff day
          </label>
          <input
            id="day"
            name="day"
            type="number"
            min={1}
            max={28}
            defaultValue={cutoff}
            required
            className="w-24 rounded-[var(--radius-sm)] border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          />
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            A cycle runs from this day of one month to the day before it in the next (e.g. 18 → 17
            for a cutoff of 18). Changing this reinterprets which cycle every existing entry falls
            into — no data is modified or lost.
          </p>
          <button type="submit" className="btn btn-primary w-fit">
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Add the nav link** — in `src/shared/ui/Nav.tsx`, update `LINKS`:

```ts
const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings', label: 'Settings' },
] as const;
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run typecheck && npm run build:web`
Expected: PASS — compiles `/settings` with no type errors.

- [ ] **Step 4: Verify end-to-end**

Run: `npm run dev:web`, open `http://127.0.0.1:4010/settings`. Expected: input prefilled with
`18`. Change it to e.g. `25`, click Save. Expected: page re-renders (or reload manually) with the
input now showing `25`. Open `/dashboard` — expected: the current-cycle label and range have
shifted to start on the 25th instead of the 18th, and the figures re-bucket accordingly (same
underlying rows, different cycle boundaries — this is the expected reinterpretation, not a bug).
Change it back to `18` to leave the DB in its original state, then stop the dev server.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/app/settings/page.tsx src/shared/ui/Nav.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/settings/page.tsx src/shared/ui/Nav.tsx
git commit -m "feat(app): add /settings page for the billing cutoff" -m "Server component with a form bound to setCutoffAction; prefills the current cutoff (default 18) and explains that changing it reinterprets cycle history rather than modifying data. Adds the nav link." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Done — definition of complete

- `/settings` shows a number input prefilled with the stored cutoff (18 by default) and saves a
  new value via a Server Action.
- `/dashboard` resolves cycles against the stored cutoff, not the hardcoded constant — changing
  the cutoff on `/settings` visibly shifts the dashboard's current-cycle label, range, and figures.
- `CycleSelector` always uses the same cutoff as the rest of the page (no default-value drift).
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web` all
  pass.
- `getCutoff`, `setCutoff`, and `isValidCutoffDay` are unit-tested; `ensureSettingsTable` is
  tested via its DDL round-trip.

## Deferred (explicitly not in this slice)

Per-account/per-card cutoff days · cutoff values outside 1..28 · any settings beyond the cutoff ·
migrating/backfilling stored data when the cutoff changes (cycle math re-buckets existing rows on
read; nothing is rewritten).
