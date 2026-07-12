# Accounts as first-class entities — design

**Date:** 2026-07-12
**Concern:** 1 of 3 (accounts). Sibling spec: `2026-07-12-toast-confirm-design.md`. Deferred sibling: Google Drive backup/restore (its own future brainstorm).
**Status:** approved, ready for implementation plan.

## Problem

`entries.account` is a free-text `text NOT NULL` column surfaced only as a datalist autocomplete on the entry form and a filter chip on `/records`. This allows dup/typo names ("Cash" vs "cash"), carries no icon or color, and gives no per-account analysis. Categories, by contrast, are first-class rows with a full management + display system. Accounts should reach the same footing (A+B+C from brainstorm): managed clean list, glanceable icon + color, and per-account breakdown/donut.

## Approach

Mirror the **categories** architecture, reusing its generic pieces, with **one deliberate divergence**: the account glyph is a bundled **payment-network brand mark** (not a free emoji), so the icon field stores an *icon key* resolved through a map — like categories' `icon-for.ts` / `icon-map.*.ts`, but with a small closed set.

## Data model

New `accounts` table (mirrors `categories`), source of truth in `src/features/accounts/schema.ts`:

| column | type | notes |
|---|---|---|
| `id` | integer PK autoincrement | surrogate key; entries FK to it |
| `name` | text NOT NULL UNIQUE | display + dedupe |
| `icon` | text NOT NULL | **icon key** (`cash` \| `card` \| `visa` \| `mastercard` \| `jcb` \| `unionpay` \| `amex` \| `qr`), not an emoji char |
| `hue` | integer (nullable) | null = auto/name-derived, same semantics as categories |
| `sort_order` | integer (nullable) | rides along inert (parity with categories) |
| `archived` | integer NOT NULL default 0 | rides along inert |

`ensureAccountsTable(db)` bootstraps with `CREATE TABLE IF NOT EXISTS`, matching the other features.

### Migration: `entries.account` text → `entries.account_id` FK

Follows the **proven** `migrateCategoryIds` / `dropLegacyCategoryColumns` template in `@db/migrate` (idempotent, guarded, invoked from any `ensure*Table` so any read path triggers the one-time backfill):

1. Create `accounts` if absent.
2. Insert one `accounts` row per distinct existing `entries.account` value (icon defaulted to `card`, hue null; user re-icons later on `/accounts`).
3. Add `entries.account_id` (nullable — SQLite can't ALTER to NOT NULL; app writes always set it), backfill by name join.
4. `dropLegacyAccountColumn` removes the now-unused `entries.account` text column once `account_id` is populated.

`EntryRow` gains the joined `account` name (as it already does for `category`); `EntryInput` keeps taking an account **name**, resolved to `account_id` at the query boundary — identical to the category name→id handling.

## Glyphs (the divergence)

Closed set of **8**, bundled as inline SVG components (zero new dependency, matches how `BottomBar` hand-inlines SVGs):

- **Generics:** `cash`, `card`
- **Brands (full-color):** `visa`, `mastercard`, `jcb`, `unionpay`, `amex`
- **Wallet:** `qr` (QR-code payment)

- `src/features/accounts/ui/AccountGlyph.tsx` — resolves an icon key → the SVG (mirrors `CategoryGlyph`). Full-color for brands; generics can be monochrome/currentColor.
- `src/features/accounts/ui/AccountIconPicker.tsx` — an 8-tile grid to pick the key (simpler than categories' free `EmojiPicker`).
- **Color is orthogonal:** `hue` still drives the **donut slice / chip** color via categories' `color.ts` (imported). Brand marks keep their own colors; the donut does not tint them.

> Trademark note: bundling Visa/MC/JCB/UnionPay/Amex marks is fine for this private, single-user, non-distributed app. Only commercial redistribution would raise a concern — out of scope here.

## `/accounts` page (management + analysis, one surface)

New route `src/app/accounts/page.tsx` (`export const dynamic = 'force-dynamic'`), added as a 4th tile in `MoreSheet` (grid `grid-cols-3` now wraps to a second row — acceptable, or bump to a tidy 2×2; implementer's call during layout).

- **Analysis:** per-account cycle spend + share, and a `DonutChart` keyed by account (reuse the existing chart; feed it account name/hue/total slices).
- **Management:** inline add / rename / icon-edit — same component shapes as `/categories` (`AddCategory`, `CategoryNameEditor`).
- **Delete = merge-guard:** every entry needs an account, so delete **reassigns** the account's entries into a chosen target account, then deletes the row. Mirror `merge-guard.ts` (imported/adapted). The merge-target chooser is a native `<dialog>` (picker + confirm), reusing the **dialog chrome** from the toast/confirm spec — but it keeps its own select; it is not forced through the yes/no `ConfirmDialog` API. On success, fire an Undo toast (see sibling spec).

## Entry form

`EntryForm` swaps the free-text `<input list>` account field for a proper account **picker** mirroring `CategoryPicker` (pick from the managed list), killing the 'Cash'/'cash' dup class. `accounts` prop shape stays `string[]` names (or upgrades to `{name, icon, hue}[]` if the picker shows glyphs — implementer's call).

## Queries (`src/features/accounts/queries.ts`)

Typed reads via the drizzle query builder (no `as`): list accounts, list-with-cycle-spend (join entries in range, sum, sort by spend desc), resolve name→id on write, merge (reassign `account_id` then delete). Reuse `getEntriesInRange` / `groupSum` patterns from entries, keyed by account.

## Reuse decision

Import `color.ts` (hue→color) and the merge-guard logic **from `features/categories` for now — do NOT graduate to `shared/`.** Two consumers isn't a pattern; graduate only if a third appears (per CLAUDE.md's cross-feature rule).

## Testing (TDD, co-located `*.test.ts`)

- `schema.test.ts` — table shape + `ensureAccountsTable` idempotency.
- migration test in `@db/migrate.test.ts` — text→id backfill, distinct-name collapse, legacy-column drop, idempotency.
- `AccountGlyph` — every icon key resolves to an SVG; unknown key falls back to `card`.
- merge-guard — reassign + delete; blocks/handles merging an account into itself.
- account breakdown/donut option-builder — pure, tested (charts stay pure builder + thin wrapper).
- account picker component test (`renderHook`/RTL as appropriate).

## Out of scope (YAGNI)

No per-account budgets · no account "types" or per-account currency · no balance/reconciliation tracking (this is a spending tracker, not a bank-balance app) · no reorder UI beyond category parity · `sort_order`/`archived` ship inert.
