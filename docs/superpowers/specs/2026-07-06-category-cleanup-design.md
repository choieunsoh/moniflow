# Category Cleanup / Merge

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation plan
**Feature area:** `src/features/entries/`

## Purpose

10+ years of hand-typed Monefy categories have fragmented: the same real-world spending shows up
under `ช็อปปิ้ง`, `ช็อปปิ้ง ชมพู่`, and `เยน ชอปปิ้ง`. This feature lets the user rename or merge
categories across the **whole ledger** in one action, from a single page that shows which
categories are biggest (and therefore worth cleaning up first). No schema change — this is a
bulk `UPDATE` over the existing `category` column.

## Scope

**In scope**
- A read query that counts rows per category, sorted by count (biggest fragments first).
- A rename/merge query: point every row of one category at another category name.
- A server action wiring a per-row form to that query.
- A `/categories` page: one row per category, a count, and an inline rename/merge form.

**Out of scope (deferred)**
- Bulk/regex rename (e.g. "rename everything matching `เยน .*` to `เยน ชอปปิ้ง`").
- Undo / rename history.
- Category color or icon assignment.
- Renaming/merging scoped to a date range or account (this is always whole-ledger).

## Feature-based placement

Everything lives inside the existing `entries` feature; one new route joins `app/`.

```
src/
├── app/
│   └── categories/page.tsx     # (new) server component — list + inline rename/merge form
├── features/entries/
│   ├── queries.ts               # (edit) + getCategoryCounts, renameCategory
│   ├── queries.test.ts          # (edit) + tests for both
│   ├── actions.ts               # (edit) + mergeCategoryAction, parseMergeInput
│   └── actions.test.ts          # (new) unit tests for parseMergeInput
```

No new files enter `shared/` or `db/`; the dependency arrow stays `features → shared/db`.

## Data model

No schema change. `entries.category` is a plain `TEXT NOT NULL` column already; a merge is just
an `UPDATE entries SET category = :to WHERE category = :from`. Because SQL naturally folds rows
into whichever value they're set to, "rename" and "merge" are **the same operation** — if `:to`
happens to already exist as a category, those rows now share it; if it doesn't, a brand-new
category name is born. No special-casing needed in the query layer.

## Queries (`queries.ts`)

```ts
export type CategoryCount = { category: string; count: number };

export function getCategoryCounts(db: Db): CategoryCount[];
export function renameCategory(db: Db, from: string, to: string): void;
```

- `getCategoryCounts` — `GROUP BY category`, count via `sql<number>\`count(*)\`` (not `as`),
  sorted **largest count first** so the page surfaces the biggest fragments up top. Grouped in
  SQL; sorted in JS the same way `queries.ts`'s existing `groupSum` helper already does for
  category/account breakdowns — the result set is at most one row per distinct category, tiny
  even over a decade of data.
- `renameCategory(db, from, to)` — a single `UPDATE ... WHERE category = from`. No-op-safe: if
  `from` matches nothing, zero rows update and nothing errors. If `from === to` the caller
  (the action, see below) should reject before calling this — the query itself doesn't need to
  special-case identity renames, but there is no reason to pay for a no-op write.

## Action (`actions.ts`)

`actions.ts` already exists (feature B, the add/edit/delete write path): it opens with
`'use server'`, imports `initDb`/`ensureEntriesTable` + the relevant query, and calls
`revalidatePath` from `next/cache` after each write. This feature **adds** to that file rather
than creating a new one.

```ts
export type MergeInput = { from: string; to: string };

export function parseMergeInput(formData: FormData): MergeInput | null;
export async function mergeCategoryAction(formData: FormData): Promise<void>;
```

- `parseMergeInput` is pulled out as a **pure, exported** validator: both `from` and `to` must be
  non-empty strings after trimming, and `from !== to`. Pulling it out of the action keeps it unit
  testable without mocking `next/cache`/`next/navigation` or standing up a fake request — the
  action body becomes a thin wire (parse → `renameCategory` → `revalidatePath`), which is the same
  shape the rest of this codebase treats as "thin, verified by hand" rather than unit-tested (see
  `CycleSelector.tsx` / `Breakdown.tsx` in the dashboard slice).
- `mergeCategoryAction(formData)`: `parseMergeInput` → if `null`, return (no-op, bad/identical
  input); else `initDb()` → `ensureEntriesTable` → `renameCategory(db, from, to)` →
  `revalidatePath('/categories')` + `revalidatePath('/dashboard')` (dashboard category breakdowns
  read the same column, so they must refresh too). No redirect — the user stays on `/categories`.

## UI (`app/categories/page.tsx`)

Server component, no client JS:

- Reads `getCategoryCounts(db)` and renders one row per category: the category name (as a
  `chip`, matching `LedgerTable`'s existing category treatment), its row count, and an inline
  `<form action={mergeCategoryAction}>` with:
  - a hidden `from` input pre-filled with that row's category,
  - a visible `to` text input backed by a `<datalist>` populated from every existing category
    name — so the user can either type a **brand-new** name (a pure rename) or pick/type an
    **existing** one (a merge), from the same control,
  - an "Apply" submit button.
- Counts are shown so the user can see which fragments are worth collapsing first (the sort is
  already largest-first from the query).
- Empty state: if there are no categories yet (empty ledger), show a short message instead of an
  empty table — no need for the full `EmptyLedger` illustration treatment; this is a secondary
  utility page.

## Testing / verification

- `queries.test.ts`: `getCategoryCounts` returns rows grouped + sorted desc by count;
  `renameCategory` renames into a brand-new name (count preserved, old category gone);
  `renameCategory` **merges** into an existing target (counts sum, source category disappears
  from `getCategoryCounts`); `renameCategory` is a no-op when `from` doesn't exist.
- `actions.test.ts`: `parseMergeInput` accepts a valid trimmed pair; rejects `from === to`;
  rejects an empty/whitespace-only `to`; rejects a missing field. No mocking required since it's
  a pure function.
- `/categories` page: typecheck + lint (no unit test — presentational + thin server-action
  wiring); manually verified by running `npm run dev:web`, opening `/categories`, merging a real
  fragmented pair from the imported ledger, and confirming both `/categories` and `/dashboard`
  reflect the merge after the form submits.
- Gates before commit (per CLAUDE.md): `format:files` changed files → `typecheck` → `lint` →
  `format:check` → `test`.

## Open questions

None outstanding. Decisions locked:
- Rename and merge are the same code path (`UPDATE ... WHERE category = from`); no special-casing.
- Merge target is picked via a text input + `<datalist>`, not a `<select>` — allows typing a new
  name freely while still surfacing existing names as suggestions.
- Whole-ledger only; no date/account scoping for this slice.
