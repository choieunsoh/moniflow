# Category `id` PK migration — design

**Date:** 2026-07-11
**Branch:** `feat/category-id-pk`
**Status:** approved, pending implementation plan

## Problem

Categories currently have **no identity of their own**. `entries.category` and
`budgets.category` are free-text strings; `category_meta` is an optional decoration table keyed by
that same string (PK = the name). A category "exists" only implicitly, because some entry references
its name.

This blocks four things the user wants:

1. **Rename without a data rewrite** — today a rename rewrites the string across every `entries` row.
2. **Stable identity across edits** — a category should keep its identity when renamed/re-emoji'd.
3. **Add a category first, then use it** — a category cannot exist today without an entry.
4. **Room for structure** (ordering, archive; subcategories later) — a bare name-keyed meta table
   can't hold it cleanly.

All four require the same move: categories become a **first-class table with a surrogate `id` PK**,
and everything that references a category does so by `id`, not by text.

Rejected half-measures:

- Keep `entries.category` as text, only add an `id` to the meta table → gives add-first + ordering
  but **not** cheap rename or stable identity (drivers 1 and 2). Fails requirements.
- Keep a denormalized `entries.category` text alongside `category_id` → dual source of truth,
  rename still rewrites text. Defeats the purpose.

**Decision: full surrogate key, `entries`/`budgets` reference `categories.id` by FK.**

## Scope

- **In:** `categories` table (replaces `category_meta`), `entries.category_id`,
  `budgets.category_id`, a one-time data migration, the query/UI ripple, import upsert-by-name, the
  add-category-first picker flow. `sort_order` + `archived` **columns** ship now.
- **Out (later slices):** subcategories / nesting (needs `parent_id` + recursive rollup in
  donut/breakdown/budgets + nested picker — a feature on its own). The management UI for
  reordering and archiving (the columns exist; the UI to drive them is a follow-up).

## Schema

`category_meta` is removed. It becomes `categories`, now with real rows instead of optional
decoration:

```
categories:
  id          INTEGER PRIMARY KEY AUTOINCREMENT
  name        TEXT NOT NULL UNIQUE       -- display name; rename = UPDATE this one row
  emoji       TEXT NOT NULL              -- was category_meta.emoji (fallback glyph if none)
  hue         INTEGER                    -- was category_meta.hue (NULL = auto, name-derived)
  sort_order  INTEGER                    -- manual ordering (NULL = fall back to name order)
  archived    INTEGER NOT NULL DEFAULT 0 -- hide from pickers without deleting

entries:
  category (TEXT)  →  category_id  INTEGER   -- FK → categories.id
budgets:
  category (TEXT)  →  category_id  INTEGER   -- FK → categories.id; NULL still = the TOTAL budget row
```

### Why `category_id` is nullable at the DB level

SQLite cannot `ALTER` an existing column to `NOT NULL` without a full 12-step table rebuild. The
column is created nullable; **application writes always set it**. This matches the codebase's
loose-bootstrap style (`ensure*Table` + inline `PRAGMA` checks, no migration runner).

`// ponytail: category_id nullable at DB level, app enforces non-null on every write; upgrade path
is a table-rebuild to a hard NOT NULL FK only if drift ever shows up.`

### `budgets.category_id` semantics

`NULL` continues to mean **the total (whole-cycle) budget row**, exactly as `category IS NULL` did.
Per-category budgets carry a real `category_id`.

## One-time data migration

Idempotent, run inside the `ensure*` bootstrap path (same mechanism as the existing `hue`
`PRAGMA`-check in `ensureCategoryMetaTable`). Guarded on "does the old `entries.category` text
column still exist?" so it runs once and is cheap on every subsequent page load.

Steps:

1. Create `categories`.
2. **Seed:** `INSERT OR IGNORE` one row per distinct name from `entries` ∪ `category_meta`,
   carrying that name's `emoji`/`hue` where a meta row exists, fallback emoji otherwise.
3. `ADD COLUMN category_id` to `entries` and `budgets`; backfill by name lookup
   (`UPDATE ... SET category_id = (SELECT id FROM categories WHERE name = <old text>)`).
   Budgets with `category IS NULL` (the total row) keep `category_id = NULL`.
4. `DROP COLUMN category` from `entries` and `budgets`; `DROP TABLE category_meta`.
   (better-sqlite3 bundles SQLite ≥ 3.35, which supports `ALTER TABLE ... DROP COLUMN`.)

**Mechanism choice:** the idempotent-`ensure` path is preferred over wiring drizzle-kit `migrate()`
(the CLAUDE.md-documented eventual upgrade). No migration runner exists yet, and `ensure*` is already
invoked in ~10 composition points. This is the lazier, codebase-consistent choice. Adopting committed
drizzle-kit migrations remains the documented future upgrade if the schema keeps growing.

The migration is the highest-risk piece (real financial data). It gets a dedicated test:
old-shape DB (text categories + a few meta rows) → asserted category rows, backfilled `category_id`
values, and dropped columns.

## Query & UI ripple (~15–20 files)

Every `GROUP BY category` becomes a join to `categories`. This is mostly mechanical, with one net
**simplification**: breakdown/donut rows now carry `name` + `emoji` + `hue` **inline from the join**,
so the current separate `getEmojiMap` / `getHueMap` + name-merge in the UI is **deleted**, not ported.

Notable changes:

- `getCategoryBreakdown` / `groupSum` → group by `category_id`, join `categories` for
  `name`/`emoji`/`hue`. Rows become self-describing.
- `listCategories` → `SELECT * FROM categories` — now includes empty categories, ordered by
  `sort_order` then `name`.
- `getCategoryCounts` → `LEFT JOIN categories` so zero-entry categories appear with count `0`.
- `renameCategory` → `UPDATE categories SET name = ? WHERE id = ?`.
- **Merge** (renaming to a name that already exists) → reassign `entries.category_id` from the old
  category to the target, then delete the old category row. `renameCategoryMeta` disappears (there is
  no separate meta table to keep in sync). `willMerge` / merge-guard logic stays but keys off ids.
- `searchEntries` category-name search → join `categories.name`.
- Budgets (`budget-status`, `budget-status.test`, `BudgetMeter`, `BudgetField`, actions,
  queries) → key by `category_id`.

## Import & "add category first"

- `parseMonefyCsv` stays **pure** and still emits category **names** (it has no DB access — that's
  what makes it unit-testable). `SKIP_CATEGORIES` and the `Initial balance` skip are unchanged.
- The DB write layer (`replaceEntries`) upserts each incoming name → id (`INSERT OR IGNORE` then
  look up) before inserting the entry rows.
- Keypad / `EntryForm` category picker: choosing a brand-new name inserts a `categories` row and then
  references its `id`. This is the "add category first" flow — a category can now exist with zero
  entries.

## Testing & gates

TDD per feature, failing-test-first:

- Migration backfill test (old-shape DB → correct category rows, ids, dropped columns).
- Merge-by-id test (reassign + delete, no orphaned entries).
- Import upsert-by-name test (new name creates one category, existing name reuses it).
- Query port tests (breakdown/counts/list/search over the joined shape).

Before each commit, run the gates separately: `npm run format:files <changed>`, `npm run typecheck`,
`npm run lint`, `npm run format:check`, `npm test`.

Commit split by scope, in dependency order:

1. `db`/`features` — `categories` schema + the idempotent migration.
2. `features` — query ports (entries, budgets), import upsert, merge-by-id.
3. `features`/`app` — UI ripple (pickers, breakdown/donut inline meta, budget fields).
