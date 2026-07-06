# Configurable Global Cutoff (Settings)

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation plan
**Feature area:** `src/features/settings/` (new), touches `src/features/entries/ui/CycleSelector.tsx`
and `src/app/dashboard/page.tsx`

## Purpose

Slice 1 hardcoded the billing-cycle cutoff at the 18th (`CUTOFF = 18` in
`src/features/entries/cycle.ts`). `cycle.ts` is already parameterized — every function takes an
optional `cutoff` argument that defaults to `CUTOFF` — so the pure math needs no changes. What's
missing is a place to **store** the user's real cutoff day and a way to **change** it, so the
dashboard reads a persisted value instead of the constant.

**Decision (locked by the user):** one **global** cutoff for the whole ledger. No per-account or
per-card cutoffs — that's explicitly deferred (see below).

## Scope

**In scope**
- A generic key-value `settings` table (so future single-value settings don't each need a new
  table/migration).
- `getCutoff` / `setCutoff` reads/writes for the one key this slice needs: `cutoff_day`.
- A Server Action (`setCutoffAction`) backing a plain HTML form.
- A `/settings` page: number input, prefilled with the current cutoff, submit button.
- Threading the stored cutoff through `dashboard/page.tsx` (`currentCycleKey`, `cycleFromKey`) and
  `CycleSelector` (which currently calls `cycleFromKey(key)` with the default).
- A nav link to `/settings`.

**Out of scope / deferred**
- Per-account / per-card cutoff days (the user chose a single global cycle for now).
- Cutoff values outside 1..28. 28 is the upper bound because every month has at least 28 days —
  a cutoff of 29/30/31 would be ambiguous or impossible in February.
- Any other settings beyond the cutoff (the KV table is deliberately generic so they're cheap to
  add later, but none are built now).
- Migrating/backfilling old data when the cutoff changes — changing the cutoff **reinterprets**
  history (which cycle a given date falls into shifts), which is expected, not a bug. No data is
  rewritten; only the cycle math re-buckets existing rows on read.

## Feature-based placement

New feature, `settings`, alongside `entries`. It has no dependency on `entries` and `entries` has
no dependency on it either — the dashboard route composes both.

```
src/
├── app/
│   ├── dashboard/page.tsx        # (edit) reads getCutoff(db), threads it through cycle calls
│   └── settings/page.tsx         # (new) server component: cutoff form
├── features/
│   ├── entries/
│   │   ├── cycle.ts               # untouched — already takes `cutoff` params, default CUTOFF=18
│   │   └── ui/CycleSelector.tsx   # (edit) accepts a `cutoff` prop, passes it to cycleFromKey
│   └── settings/                  # (new) — the settings domain
│       ├── schema.ts              # drizzle table + ensureSettingsTable(db) + Setting type
│       ├── schema.test.ts         # DDL round-trip test
│       ├── queries.ts             # getCutoff / setCutoff / isValidCutoffDay
│       ├── queries.test.ts        # default, round-trip, overwrite, validator tests
│       └── actions.ts             # 'use server' — setCutoffAction(formData)
└── shared/ui/Nav.tsx              # (edit) + Settings link
```

**Dependency rule respected:** `settings` does not import from `entries`, and `entries` does not
import from `settings`. This means the "default cutoff" constant is **intentionally duplicated**
as a plain literal (`18`) in `settings/queries.ts` rather than importing `CUTOFF` from
`entries/cycle.ts` — a cross-feature import would violate the `features → shared/db` dependency
arrow (feature-to-feature imports aren't the sanctioned direction; shared code would be the
correct home if this constant needed to be shared, but a single literal isn't worth graduating to
`shared/` for one feature's fallback default). Both constants happen to equal 18 because that is
the user's real-world billing cutoff *today* — coincidence of value, not a coupling.

## Schema (`src/features/settings/schema.ts`)

A generic key-value table — deliberately not cutoff-specific, so future single-value settings
reuse it without a new migration:

```
key    TEXT PRIMARY KEY
value  TEXT NOT NULL
```

`ensureSettingsTable(db)` bootstraps it with `CREATE TABLE IF NOT EXISTS`, matching the drizzle
table definition, same pattern as `ensureEntriesTable`. Export a `Setting` type
(`typeof settings.$inferSelect`).

## Queries (`src/features/settings/queries.ts`)

- `getCutoff(db): number` — selects the row where `key = 'cutoff_day'`. If no row exists (fresh
  DB, or a DB that predates this feature), returns `18` — the same value Slice 1 hardcoded, so
  upgrading is invisible until the user opts into changing it. Otherwise `Number(row.value)`.
- `setCutoff(db, day): void` — upserts the `cutoff_day` row. Implemented as delete-then-insert
  inside a transaction (mirrors the `replaceEntries` pattern already in this codebase, in
  `entries/queries.ts`) rather than `onConflictDoUpdate` — simpler for a single-row key and avoids
  introducing a second drizzle upsert idiom into the codebase for one call site.
- `isValidCutoffDay(day: number): boolean` — pure validator, `Number.isInteger(day) && day >= 1 &&
  day <= 28`. Exported and unit-tested on its own; reused by the Server Action so validation logic
  isn't duplicated between a test and the action.

## Server Action (`src/features/settings/actions.ts`)

`'use server'` module, one exported async function, following the pattern already established for
Server Actions in this codebase (`initDb()` → `ensure<Table>Table` → validate → write →
`revalidatePath`):

```ts
export async function setCutoffAction(formData: FormData): Promise<void> {
  const day = Number(formData.get('day'));
  if (!isValidCutoffDay(day)) throw new Error(...);
  const db = initDb();
  ensureSettingsTable(db);
  setCutoff(db, day);
  revalidatePath('/dashboard');
  revalidatePath('/settings');
}
```

No `redirect()` — the form posts back to `/settings` itself (Next re-renders it after the action
resolves), and `/dashboard` is revalidated so its next visit picks up the new cutoff.

## Wiring into the dashboard (`src/app/dashboard/page.tsx`)

- Import `getCutoff` from `@features/settings/queries` and `ensureSettingsTable` from
  `@features/settings/schema`.
- After `ensureEntriesTable(db)`, add `ensureSettingsTable(db)` and `const cutoff =
  getCutoff(db)`.
- `currentCycleKey(todayIso())` → `currentCycleKey(todayIso(), cutoff)`.
- `cycleFromKey(activeKey)` → `cycleFromKey(activeKey, cutoff)`.
- `cycleProgress(cycle, todayIso())` needs no change — it takes a resolved `Cycle`, not a cutoff.
- `<CycleSelector activeKey={activeKey} />` → `<CycleSelector activeKey={activeKey}
  cutoff={cutoff} />`.

## `CycleSelector` change (`src/features/entries/ui/CycleSelector.tsx`)

Currently calls `cycleFromKey(key)` three times, relying on the `cutoff = CUTOFF` default. This
component now takes a required `cutoff: number` prop (no default — the dashboard always has one
from `getCutoff`, and a silent default here would let the picker labels drift out of sync with the
rest of the page if the caller ever forgot to pass it) and threads it through every
`cycleFromKey(..., cutoff)` call. `stepKey` is unaffected — it steps a `YYYY-MM` key by month
count and never touches the day-of-month.

## `/settings` page (`src/app/settings/page.tsx`)

Server component, no client JS (matches the scaffold pattern used by `/dashboard`):
- Reads `getCutoff(db)` (after `ensureSettingsTable(db)`) to prefill the input.
- Renders `<form action={setCutoffAction}>` with a `type="number"` input (`min={1} max={28}`,
  `name="day"`, `defaultValue={cutoff}`) and a submit button.
- Explanatory copy under the input: changing the cutoff reinterprets which cycle every existing
  entry falls into — this is expected, not data loss.

## Nav (`src/shared/ui/Nav.tsx`)

Add `{ href: '/settings', label: 'Settings' }` to the existing `LINKS` array — no other change
needed, the active-link highlighting already works off `pathname.startsWith(href)`.

## Testing / verification

- `schema.test.ts`: `ensureSettingsTable` creates a table a row can be inserted into and read
  back.
- `queries.test.ts`: `getCutoff` defaults to `18` when unset; `setCutoff` → `getCutoff` round-trips
  a value; a second `setCutoff` overwrites (not duplicates) the row; `isValidCutoffDay` accepts
  1..28 and rejects 0, 29, non-integers, and `NaN`.
- `setCutoffAction` is not unit-tested (Server Actions wrapping `revalidatePath` aren't practical
  to exercise under Vitest without mocking `next/cache`) — it's verified manually via the running
  `/settings` page, consistent with how this repo already verifies Server Actions and CLI commands
  end-to-end rather than mocking framework internals.
- End-to-end sanity: open `/settings`, change the cutoff, save, then open `/dashboard` and confirm
  the current-cycle label and range shifted to match the new cutoff day.
- Gates before every commit (per CLAUDE.md): `format:files` changed files → `typecheck` → `lint` →
  `format:check` → `test`.

## Open questions

None outstanding. Decisions locked:
- Global cutoff only; per-account cutoffs deferred.
- Valid range 1..28.
- Changing the cutoff reinterprets cycle history in place; no backfill/migration of stored rows.
- KV `settings` table is intentionally generic for future reuse, but only `cutoff_day` is built
  now.
