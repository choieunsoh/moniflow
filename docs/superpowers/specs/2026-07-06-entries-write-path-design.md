# Slice 2 — Entries Write Path (Add / Edit / Delete)

**Date:** 2026-07-06
**Status:** Approved design, ready for implementation plan
**Feature area:** `src/features/entries/`

## Purpose

Turn the read-only ledger from Slice 1 (Monefy import + cycle dashboard) into one the user can
maintain by hand: add a new inflow/outflow, edit an existing row, delete a mistaken one. This is
the write-path foundation — budgets and category cleanup build on top of it in later slices.

## Scope

**In scope**
- One nullable schema column — `time` (24h `'HH:MM'`) — for finer same-day ordering of
  hand-entered rows.
- A pure, unit-tested form parser: raw `FormData` → a validated `NewEntry` or a human-readable
  error.
- Six single-row query functions: insert / update / delete / read-by-id, plus distinct
  category and account lists (to power the form's choose-or-type-new inputs).
- Three Next.js Server Actions wiring the parser + queries into the mutation model this slice
  introduces for the codebase.
- One `EntryForm` client component, reused for both add and edit.
- Two routes: `/entries/new` and `/entries/[id]/edit`.
- Ledger affordances: an Edit link + a Delete form on every dashboard ledger row, and a
  "＋ Add entry" link in the dashboard header.

**Out of scope (later slices)**
- Receipt scan / OCR import.
- Recurring entries.
- Bulk edit.
- Category merge / alias cleanup tool (carried over from Slice 1's deferred list).
- Auto FX lookup (carried over — conversion stays manual).
- A `source` column distinguishing hand-entered rows from imported ones. `replaceEntries`
  (Slice 1) already carries a `ponytail` note that this is needed once a write path exists —
  it now does, but re-running the Monefy import will still truncate hand-entered rows until
  that column lands. Flagged here, not fixed here: the import command is not touched this slice.
- Polished inline validation UI. A failed `parseEntryForm` throws from the Server Action and
  surfaces via Next's default error boundary — acceptable for a single-user local app; a
  friendlier inline error path is deferred.

## Feature-based placement

All Slice 2 work lives inside the `entries` feature, plus two new thin routes under
`src/app/entries/`. Nothing new enters `shared/` or `db/`; the dependency arrow stays
`features → shared/db`, never back.

```
src/
├── app/
│   ├── dashboard/page.tsx            # (edit) "+ Add entry" header link
│   └── entries/
│       ├── new/page.tsx              # (new) add-entry route
│       └── [id]/edit/page.tsx        # (new) edit-entry route, 404 if missing
├── db/client.ts                      # untouched — connection only, no feature imports
├── features/entries/
│   ├── schema.ts                     # (edit) + time column
│   ├── entry-form.ts                 # (new) FormData → NewEntry — pure
│   ├── entry-form.test.ts            # (new)
│   ├── queries.ts                    # (edit) + single-row write/read queries
│   ├── queries.test.ts               # (edit)
│   ├── actions.ts                    # (new) Server Actions — the only feature module allowed
│   │                                   #      to touch Next's mutation APIs
│   └── ui/
│       ├── EntryForm.tsx             # (new) client form, add + edit
│       └── LedgerTable.tsx           # (edit) + Edit link, Delete form per row
├── shared/                           # untouched — date.ts, money.ts stay feature-agnostic
└── cli.ts                            # untouched this slice
```

## Schema change

Add one nullable column to the existing `entries` table (currently `id, date, account, category,
amount, currency, original_amount, note`):

```
time  TEXT   -- 24h 'HH:MM', nullable
```

Update both `schema.ts` (drizzle table + `ensureEntriesTable` DDL) so the bootstrap
`CREATE TABLE` matches the drizzle definition, per the existing convention.

`getRecentEntries` (in `queries.ts`) already orders by `desc(date), desc(id)`; extend it to
`desc(date), desc(time), desc(id)` so same-day rows sort by time-of-day before falling back to
insertion order. `time` is nullable — under SQLite, `ORDER BY … DESC` sorts `NULL` **last**
(SQLite treats `NULL` as the smallest value, and `DESC` reverses ascending order), so untimed
rows fall to the bottom of their date group. This is acceptable and noted, not "fixed" —
untimed rows have no finer signal to sort by.

## Pure form parser (`entry-form.ts`)

```ts
export const CURRENCIES = ['THB', 'JPY', 'KRW', 'USD', 'EUR', 'HKD', 'GBP', 'SGD'] as const;
export function parseEntryForm(fd: FormData): { ok: true; entry: NewEntry } | { ok: false; error: string };
```

**Reads** these string fields from the `FormData`: `direction` (`'expense' | 'income'`, default
`'expense'` for anything else), `account`, `currency`, `amount` (the amount in the entry's
**original** currency, always positive), `thb` (the THB-converted amount — when `currency ===
'THB'` the two figures are equal by construction, so the form never shows a second field and
the parser derives `thb` from `amount` in that case rather than trusting a possibly-absent
field), `category`, `date` (`'YYYY-MM-DD'`), `time` (`'HH:MM'` or `''`), `note`.

**Validation**, in order, each returning `{ ok: false, error }` on the first failure:
1. `account` empty → `'Account is required.'`
2. `category` empty → `'Category is required.'`
3. `date` empty → `'Date is required.'`
4. `currency` not one of `CURRENCIES` → `'Choose a valid currency.'`
5. `amount` not a positive finite number → `'Amount must be a positive number.'`
6. Only when `currency !== 'THB'`: `thb` not a positive finite number →
   `'THB amount must be a positive number.'`

**On success**, computed fields:
- `sign = direction === 'income' ? 1 : -1`
- `amount` (THB, stored) = `sign * thb`
- `originalAmount` = `sign * amount_original` (the original-currency figure read from the form)
- `time` = `''` → `null`, else the raw string
- `note` = `''` → `null`, else the raw string (trimmed)

No DB, no Next imports — this stays a pure function so it is exhaustively unit-testable without
a database or a request.

## Write queries (`queries.ts`)

Six new single-row functions, alongside the existing whole-table and cycle-scoped reads:

- `insertEntry(db, e: NewEntry): void`
- `updateEntry(db, id: number, e: NewEntry): void` — replaces every column for that id.
- `deleteEntry(db, id: number): void`
- `getEntryById(db, id: number): Entry | undefined`
- `getDistinctCategories(db): string[]` — `SELECT DISTINCT category ORDER BY category`, for the
  form's category `<datalist>`.
- `getDistinctAccounts(db): string[]` — same, for accounts.

## Server Actions (`actions.ts`) — the mutation pattern this slice introduces

Every previous slice was read-only; this is the first feature module allowed to import Next's
mutation APIs (`revalidatePath`, `redirect`). The file starts with `'use server'` so every
exported async function is a Server Action:

- **`addEntryAction(fd)`** — `initDb()` → `ensureEntriesTable(db)` → `parseEntryForm(fd)`; if
  `!ok`, `throw new Error(result.error)`; else `insertEntry(db, result.entry)` →
  `revalidatePath('/dashboard')` → `redirect('/dashboard')`.
- **`editEntryAction(fd)`** — same setup; reads `id = Number(fd.get('id'))`; parses the rest;
  `updateEntry(db, id, result.entry)` → revalidate → redirect.
- **`deleteEntryAction(fd)`** — reads `id`; `deleteEntry(db, id)` → `revalidatePath('/dashboard')`
  only (no redirect — the delete form lives on the dashboard itself, so there's nowhere to
  navigate to).

better-sqlite3 runs synchronously inside a Server Action without issue — it is already listed in
`next.config.ts`'s `serverExternalPackages`, and Server Actions execute server-side same as any
other server code path.

## UI

**`EntryForm.tsx`** (`'use client'`) — the one interactive component this slice introduces.
Props: `{ action, accounts, categories, entry? }`.
- `currency` is a controlled `<select>` (options = `CURRENCIES`); when it is anything other than
  `'THB'`, a second "THB amount" number input appears (`thb`). When `currency === 'THB'`, that
  field is hidden entirely — the parser derives `thb` from `amount` in that branch, so nothing
  needs to mirror it.
- `account` and `category` are `<input list>` + `<datalist>` pairs sourced from
  `getDistinctAccounts` / `getDistinctCategories` — type an existing value or a brand-new one.
- `direction` is a two-way radio toggle, defaulting to `'expense'` for a new entry, or to
  whichever sign the existing row has when editing.
- `date` (`type="date"`), `time` (`type="time"`, optional), `amount`, `note` round out the form.
- Renders a plain `<form action={action}>` — no client-side submit handler, no
  `useActionState`; Next dispatches the bound Server Action directly, matching this app's
  general no-client-JS-unless-needed stance as closely as a mutable form allows.
- When `entry` is provided (edit mode), every field is pre-filled and a hidden `id` input is
  included so `editEntryAction` knows which row to update.

**Routes**
- `src/app/entries/new/page.tsx` — server component: loads distinct accounts/categories, renders
  `<EntryForm action={addEntryAction} .../>`.
- `src/app/entries/[id]/edit/page.tsx` — server component: `getEntryById`; `notFound()` if
  missing; otherwise renders `<EntryForm action={editEntryAction} entry={entry} .../>`.

**Ledger affordances** — on the dashboard's `LedgerTable` rows: an "Edit" link to
`/entries/[id]/edit`, and a tiny "Delete" `<form action={deleteEntryAction}>` with a hidden `id`
input, both in a new right-aligned Actions column. A "＋ Add entry" link to `/entries/new` sits
in the dashboard header, next to the existing title/subtitle.

## Testing / verification

- `entry-form.test.ts`: THB expense (thb === amount by construction); JPY expense with a
  separately-typed THB conversion; income flips the sign on both `amount` and `originalAmount`;
  blank `time`/`note` become `null`; every validation error path (empty account/category/date,
  invalid currency, non-positive amount, non-positive `thb` when non-THB).
- `queries.test.ts` additions: insert → `getEntryById` round-trip (including `time` and
  `currency`); `getEntryById` returns `undefined` for a missing id; `updateEntry` mutates every
  column; `deleteEntry` removes the row; `getDistinctCategories` / `getDistinctAccounts` return
  sorted, de-duplicated lists.
- `entries.test.ts` addition: a row with a `time` round-trips it; a row without one reads back
  `null`.
- No unit tests for `actions.ts`, `EntryForm.tsx`, or the two routes — consistent with this
  repo's existing convention of not unit-testing Server/Client Components (see Slice 1's
  `CycleSelector`/`Breakdown`/dashboard page, verified via `build:web` + manual `dev:web`
  smoke-check instead). Verification here: `npm run build:web` compiles the new routes; manually
  add an entry, edit it, delete it, and confirm the dashboard reflects each change.
- Gates before commit (per CLAUDE.md): `format:files` changed files → `typecheck` → `lint` →
  `format:check` → `test`.

## Open questions

None outstanding. Decisions locked:
- `thb` is only independently validated for non-THB currencies; for THB the parser derives it
  from `amount` rather than trusting the form to have sent a matching value.
- Validation failures throw from the Server Action and surface via Next's default error
  boundary — no bespoke inline error UI this slice.
- The Monefy import's truncate-then-reload behavior (`replaceEntries`) is untouched; re-running
  `import` after this slice ships will still wipe hand-entered rows. A `source` column is the
  fix, explicitly deferred (already flagged as a `ponytail` note in `queries.ts`).
- `getRecentEntries`'s null-sorts-last behavior for untimed rows is accepted as-is, not treated
  as a bug.
