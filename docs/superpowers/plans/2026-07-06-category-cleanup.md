# Category Cleanup / Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user rename or merge fragmented ledger categories (e.g. `ช็อปปิ้ง` / `ช็อปปิ้ง ชมพู่` / `เยน ชอปปิ้ง`) across the whole 10-year history from a single `/categories` page, with no schema change.

**Architecture:** A `GROUP BY` read (`getCategoryCounts`) surfaces categories by size; a single-statement `UPDATE` write (`renameCategory`) does the rename/merge — the same code path handles both because SQL naturally folds rows into whatever value they're set to. A server action (`mergeCategoryAction`, added to the existing `actions.ts`) wires a per-row form to that write, with its validation pulled into a pure, separately-tested `parseMergeInput`. All work stays inside `src/features/entries/` plus one new route (`app/categories/page.tsx`); the dependency arrow stays `features → shared/db`.

**Tech Stack:** TypeScript (ESM, strict) · better-sqlite3 + drizzle-orm · Next 16 App Router (React 19 server components + server actions) · Vitest.

---

## Conventions (read before starting)

- **Tests:** Vitest `describe/it/expect`; DB tests use `initDb(':memory:')` then `ensureEntriesTable(db)`.
- **TS bans (enforced as lint errors):** no `any`, no `as` casts, no `!`, no ts-comments. `as const` and `sql<T>` generics are allowed. Prefer `type` over `interface`, `for..of` over `forEach`.
- **Path aliases:** `@db/*`, `@features/*`, `@shared/*`.
- **Run a single test file:** `npm test -- src/features/entries/<file>.test.ts`
- **Imports stay at the top, merged:** when a step appends to a file that already imports from a module, add the new names to the existing `import { … } from './x'` line rather than writing a second import statement (avoids `import/first` and `import/no-duplicates` lint errors).
- **`actions.ts` already exists** (built by the parallel add/edit/delete-entry slice): it opens with `'use server'`, imports `initDb` from `@db/client` and `ensureEntriesTable` from `./schema`, and calls `revalidatePath` from `next/cache` after each write. Tasks below **append** to it — do not recreate the file. If, at the time you run this plan, `src/features/entries/actions.ts` does not yet exist (the other slice hasn't landed), create it fresh with just the `'use server'` directive, the imports this plan needs, and the two exports from Task 3 — nothing else.
- **Gates before every commit:** `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. All must pass.
- **Commit style:** `type(scope): subject` with `-m` body. Scopes here: `features`, `app`. Footer lines:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/features/entries/queries.ts` | modify | Add `getCategoryCounts`, `renameCategory` |
| `src/features/entries/queries.test.ts` | modify | Tests for both, including the merge case |
| `src/features/entries/actions.ts` | modify (or create if missing) | Add `parseMergeInput`, `mergeCategoryAction` |
| `src/features/entries/actions.test.ts` | create | Unit tests for `parseMergeInput` |
| `src/app/categories/page.tsx` | create | Server component: category list + inline rename/merge form |

---

## Task 1: `getCategoryCounts` query

**Files:**
- Modify: `src/features/entries/queries.ts`
- Modify: `src/features/entries/queries.test.ts`

- [ ] **Step 1: Write the failing test** — append to `queries.test.ts`. Add `getCategoryCounts` to the existing `import { ... } from './queries'` line, then append this block:

```ts
describe('getCategoryCounts', () => {
  it('groups by category and counts rows, largest count first', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง', amount: -50 },
      { date: '2026-07-03', account: 'a', category: 'อาหาร', amount: -30 },
    ]);
    expect(getCategoryCounts(db)).toEqual([
      { category: 'ช็อปปิ้ง', count: 2 },
      { category: 'อาหาร', count: 1 },
    ]);
  });

  it('returns an empty array for an empty ledger', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    expect(getCategoryCounts(db)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — `getCategoryCounts` not exported.

- [ ] **Step 3: Implement** — append to `src/features/entries/queries.ts`:

```ts
export type CategoryCount = { category: string; count: number };

// Category cleanup surface: how many rows sit in each category, so the biggest fragments are
// obvious before a rename/merge. Grouped in SQL; sorted by count in JS — same pattern as
// groupSum above, since the result set is at most one row per distinct category, tiny even over
// a decade of data.
export function getCategoryCounts(db: Db): CategoryCount[] {
  return db
    .select({ category: entries.category, count: sql<number>`count(*)` })
    .from(entries)
    .groupBy(entries.category)
    .all()
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): add getCategoryCounts query" -m "Groups the ledger by category and counts rows, sorted largest-first, so the upcoming /categories page can surface the biggest fragments (e.g. duplicate 'ช็อปปิ้ง' variants) first." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 2: `renameCategory` query (rename + merge)

Rename and merge are the same operation: an `UPDATE ... WHERE category = from`. If `to` already
exists, matching rows fold into it automatically — no special-casing needed.

**Files:**
- Modify: `src/features/entries/queries.ts`
- Modify: `src/features/entries/queries.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `queries.test.ts`. Add `renameCategory` to the existing `import { ... } from './queries'` line, then append this block:

```ts
describe('renameCategory', () => {
  it('renames every row in a category to a brand-new name', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'ช็อปปิ้ง ชมพู่', amount: -50 },
    ]);
    renameCategory(db, 'ช็อปปิ้ง ชมพู่', 'ช็อปปิ้ง');
    expect(getCategoryCounts(db)).toEqual([{ category: 'ช็อปปิ้ง', count: 2 }]);
  });

  it('merges into an existing target category — counts sum, source disappears', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [
      { date: '2026-07-01', account: 'a', category: 'ช็อปปิ้ง', amount: -100 },
      { date: '2026-07-02', account: 'a', category: 'เยน ชอปปิ้ง', amount: -230 },
      { date: '2026-07-03', account: 'a', category: 'เยน ชอปปิ้ง', amount: -20 },
    ]);
    renameCategory(db, 'เยน ชอปปิ้ง', 'ช็อปปิ้ง');
    expect(getCategoryCounts(db)).toEqual([{ category: 'ช็อปปิ้ง', count: 3 }]);
  });

  it('is a no-op when the source category does not exist', () => {
    const db = initDb(':memory:');
    ensureEntriesTable(db);
    addEntries(db, [{ date: '2026-07-01', account: 'a', category: 'อาหาร', amount: -100 }]);
    renameCategory(db, 'ไม่มีอยู่จริง', 'อาหาร');
    expect(getCategoryCounts(db)).toEqual([{ category: 'อาหาร', count: 1 }]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — `renameCategory` not exported.

- [ ] **Step 3: Implement** — change the top import line in `src/features/entries/queries.ts` to add `eq`:

```ts
import { desc, and, gte, lte, sql, eq } from 'drizzle-orm';
```

Then append:

```ts
// Whole-ledger category rename. If `to` already exists, matching rows fold into it automatically
// — a merge, not a separate code path. No-op-safe: only rows where category = `from` are
// touched, so renaming a category that doesn't exist updates zero rows.
export function renameCategory(db: Db, from: string, to: string): void {
  db.update(entries).set({ category: to }).where(eq(entries.category, from)).run();
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS. Also run the whole suite to confirm nothing else regressed:
Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(features): add renameCategory query for cleanup and merge" -m "Single UPDATE ... WHERE category = from. Renaming into a brand-new name and merging into an existing one are the same code path — SQL folds matching rows into whatever they're set to. No-op-safe when the source category doesn't exist." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 3: `mergeCategoryAction` server action

Adds to the existing `src/features/entries/actions.ts` (feature B's add/edit/delete write path).
Validation is pulled into a pure, exported `parseMergeInput` so it's unit-testable without
mocking `next/cache` or `next/navigation` — the action body itself stays a thin wire (parse →
`renameCategory` → `revalidatePath`) and is verified by hand via the page in Task 4, the same way
this codebase treats other thin wiring (e.g. `CycleSelector.tsx`).

**Files:**
- Modify: `src/features/entries/actions.ts` (create per the fallback note in Conventions if it doesn't exist yet)
- Create: `src/features/entries/actions.test.ts`

- [ ] **Step 1: Write the failing test** — create `src/features/entries/actions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseMergeInput } from './actions';

function fd(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe('parseMergeInput', () => {
  it('accepts a valid from/to pair, trimmed', () => {
    expect(parseMergeInput(fd({ from: ' ช็อปปิ้ง ชมพู่ ', to: ' ช็อปปิ้ง ' }))).toEqual({
      from: 'ช็อปปิ้ง ชมพู่',
      to: 'ช็อปปิ้ง',
    });
  });

  it('rejects when from and to are the same after trimming', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร', to: ' อาหาร ' }))).toBeNull();
  });

  it('rejects an empty or whitespace-only to', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร', to: '   ' }))).toBeNull();
  });

  it('rejects a missing field', () => {
    expect(parseMergeInput(fd({ from: 'อาหาร' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npm test -- src/features/entries/actions.test.ts`
Expected: FAIL — module missing, or `parseMergeInput` not exported.

- [ ] **Step 3: Implement** — in `src/features/entries/actions.ts`:

If the file already exists, merge `renameCategory` into its existing
`import { ... } from './queries'` line, and merge `ensureEntriesTable` / `initDb` into their
existing import lines if not already present, then append the two exports below. If the file
does not exist yet, create it with exactly this content:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { initDb } from '@db/client';
import { ensureEntriesTable } from './schema';
import { renameCategory } from './queries';

export type MergeInput = { from: string; to: string };

// Pure validation, exported for unit tests. mergeCategoryAction itself just wires this to the DB
// and revalidatePath — thin enough to verify by hand via the /categories page rather than mock
// the Next.js server-action runtime.
export function parseMergeInput(formData: FormData): MergeInput | null {
  const from = formData.get('from');
  const to = formData.get('to');
  if (typeof from !== 'string' || typeof to !== 'string') return null;
  const trimmedFrom = from.trim();
  const trimmedTo = to.trim();
  if (trimmedFrom === '' || trimmedTo === '' || trimmedFrom === trimmedTo) return null;
  return { from: trimmedFrom, to: trimmedTo };
}

export async function mergeCategoryAction(formData: FormData): Promise<void> {
  const input = parseMergeInput(formData);
  if (input === null) return;

  const db = initDb();
  ensureEntriesTable(db);
  renameCategory(db, input.from, input.to);
  revalidatePath('/categories');
  revalidatePath('/dashboard');
}
```

(If `actions.ts` already exists with its own add/edit/delete exports, keep all of that intact —
only add the `renameCategory` import name, and append `MergeInput` / `parseMergeInput` /
`mergeCategoryAction` below the existing code. Do not duplicate the `'use server'` directive, the
`initDb` import, or the `ensureEntriesTable` import if they're already there.)

- [ ] **Step 4: Run it, verify it passes**

Run: `npm test -- src/features/entries/actions.test.ts`
Expected: PASS. Also run the whole suite:
Run: `npm test`
Expected: all PASS (this exercises any existing add/edit/delete tests in the same file's
directory too).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/actions.ts src/features/entries/actions.test.ts
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/features/entries/actions.ts src/features/entries/actions.test.ts
git commit -m "feat(features): add mergeCategoryAction for category rename/merge" -m "parseMergeInput validates a from/to pair (non-empty, distinct) and is unit-tested directly; mergeCategoryAction wires it to renameCategory and revalidates both /categories and /dashboard, since the dashboard's category breakdown reads the same column." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Task 4: `/categories` page

Server component, no client JS. Lists every category with its row count and an inline
rename/merge form, biggest fragments first (the query is already sorted).

**Files:**
- Create: `src/app/categories/page.tsx`

- [ ] **Step 1: Create the page** — full new `src/app/categories/page.tsx`:

```tsx
// Reads the local SQLite DB per request — same rationale as the dashboard page: better-sqlite3
// can't be prerendered, and the category list must reflect the latest import/merge.
export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getCategoryCounts } from '@features/entries/queries';
import { mergeCategoryAction } from '@features/entries/actions';

export default function CategoriesPage() {
  const db = initDb();
  ensureEntriesTable(db);
  const counts = getCategoryCounts(db);

  return (
    <div className="mx-auto flex max-w-[840px] flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          Ten years of hand-typed categories fragment (&quot;ช็อปปิ้ง&quot; vs &quot;ช็อปปิ้ง
          ชมพู่&quot;). Rename one to clean it up, or type an existing name to merge into it.
        </p>
      </header>

      <section className="panel overflow-hidden">
        {counts.length === 0 ? (
          <p className="p-5 text-sm" style={{ color: 'var(--color-muted)' }}>
            No categories yet — import or add some entries first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
                  <Th className="text-left">Category</Th>
                  <Th className="text-right">Entries</Th>
                  <Th className="text-left">Rename / merge into</Th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.category} className="border-t">
                    <td className="px-5 py-3">
                      <span className="chip">{c.category}</span>
                    </td>
                    <td
                      className="tnum px-5 py-3 text-right"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {c.count}
                    </td>
                    <td className="px-5 py-3">
                      <form action={mergeCategoryAction} className="flex items-center gap-2">
                        <input type="hidden" name="from" value={c.category} />
                        <input
                          name="to"
                          list="category-options"
                          placeholder="new or existing name…"
                          required
                          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm"
                          style={{
                            background: 'var(--color-surface-2)',
                            color: 'var(--color-text)',
                          }}
                        />
                        <button type="submit" className="btn btn-ghost">
                          Apply
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <datalist id="category-options">
        {counts.map((c) => (
          <option key={c.category} value={c.category} />
        ))}
      </datalist>
    </div>
  );
}

function Th({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`px-5 py-2.5 text-xs font-medium ${className}`}>{children}</th>;
}
```

- [ ] **Step 2: Build to catch type/route errors**

Run: `npm run build:web`
Expected: build succeeds (compiles `/categories`), no type errors.

- [ ] **Step 3: Verify in the running app**

Run: `npm run dev:web`, then open `http://127.0.0.1:4001/categories`.
Expected: every distinct category in the ledger appears with a count, sorted largest-first. Pick
a small fragment (e.g. a JPY-trip shopping category) and type an existing bigger category's exact
name into its "to" field — the `<datalist>` should suggest existing names as you type. Submit.
Expected: the page reloads with that row gone and the target category's count increased by the
merged amount; opening `/dashboard` shows the category breakdown reflecting the merge too. Stop
the dev server when done.

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/categories/page.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
git add src/app/categories/page.tsx
git commit -m "feat(app): add /categories page for category rename and merge" -m "Lists every category with its row count (biggest fragments first) and an inline form per row, backed by a datalist of existing category names, so a name can be typed fresh (rename) or picked from what already exists (merge)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01PqEBaVYHgYGEs9MaWtWaSm"
```

---

## Done — definition of complete

- `/categories` lists every category with a row count, sorted largest-first.
- Typing a brand-new name into a row's "to" field renames that category everywhere.
- Typing an existing category's name merges the row into it — counts sum, the old name
  disappears from the list.
- `/dashboard`'s category breakdown reflects a merge immediately after it's applied.
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build:web`
  all pass.
- `getCategoryCounts`, `renameCategory` (including the merge case and the no-op case), and
  `parseMergeInput` are unit-tested.

## Deferred (explicitly not in this slice)

Bulk/regex rename · undo / rename history · category color or icon assignment · scoping a
rename/merge to a date range or account (this slice is always whole-ledger).
