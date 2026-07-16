# Recurring rules in the catalog backup — design

Date: 2026-07-16
Status: approved, pending implementation plan

## Problem

Moniflow can already back up two things to a JSON "catalog" file from Settings: category display
metadata (emoji/hue/order/archived) and account metadata (icon/hue/order). This is the supplement to
the Monefy CSV, which carries only the ledger rows, not the display config.

Recurring rules — the standing subscriptions/bills/installments that post themselves — are a third
kind of configuration, and they currently have **no backup path at all**. Wipe the browser, switch
devices, or restore an older ledger, and every rule is gone; you re-enter them by hand. They belong
in the same backup the catalog already carries.

## Goals

- A user can export their recurring rules and re-create them on a fresh ledger (new device, after a
  wipe) without hand-entry.
- One backup file, one restore action — rules ride along with categories and accounts.
- No existing backup breaks: a catalog file saved before this feature still restores.
- Restore is non-destructive and idempotent, exactly like the catalog it extends.

## Non-goals

- **Preserving posting history.** An imported rule starts fresh; it does not carry how far it has
  posted, and does not resume an installment mid-way. (Chosen deliberately — see "Reset semantics".)
- **Updating an existing rule from a backup.** Import inserts new rules and skips names that already
  exist; it never edits a running rule. (See "Import semantics".)
- **A separate recurring-only export file.** Rules fold into the existing catalog JSON, not a third
  pair of buttons.
- **Exporting archived rules.** Only active (non-archived) rules are backed up.

## Decisions

| Decision              | Choice                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| Packaging             | Fold into the existing catalog file; bump `version` 1 → 2               |
| Backward compat       | Parser accepts version 1 (no rules) AND 2 (with rules)                  |
| Posting pointer       | Reset — export the definition only, not `lastPosted`/`startDate`/`startSeq` |
| Import conflict       | Insert-if-name-absent; skip an existing name (non-destructive, idempotent) |
| Category/account refs | By NAME, resolved to ids on import (like `EntryInput`); auto-created if missing |
| Restore order         | categories → accounts → rules (dependency order)                        |
| Which rules export    | Active (non-archived) only                                              |

## Reset semantics — why the pointer is dropped

A rule stores one piece of runtime state: `lastPosted`, the single pointer from which its payment
count and installment progress derive. That pointer is meaningful only within the ledger that wrote
it. Carried into a different ledger it is at best meaningless and at worst harmful — a rule claiming
it "posted through September" would silently skip its own catch-up on a fresh install.

So the export carries the rule's **definition**, not its state. On import the rule is created as if
freshly entered: `lastPosted = null`, `startSeq = 1`, and `startDate` = its next due date computed
from today. It therefore posts from its next occurrence forward and never retroactively dumps months
of old entries. An installment imports as "N payments from the start", not resumed mid-way.

**The one field this can't drop: a yearly rule's month.** A yearly rule renews in a specific month,
and that month lives only inside `startDate` (schedule.ts reads the day from `day` but the month from
the anchor's year-month). Dropping `startDate` would lose it. So the export carries an explicit
`month` field (1–12 for yearly, null for monthly) — enough to reconstruct "next occurrence of March
16th" on import, and nothing more.

## Data shape

The catalog file's top level bumps to `version: 2` and gains a `recurrences` array. Each rule:

```ts
export type RuleCatalogRow = {
  name: string;
  category: string; // by name; resolved to category_id on import (auto-created if missing)
  account: string; // by name; resolved to account_id on import (auto-created if missing)
  amount: number; // positive magnitude (the sweep negates on post)
  currency: string | null; // 'USD' etc, or null/'THB' for a plain baht rule
  rate: number | null; // pinned THB-per-unit, or null to price at the live rate each due date
  day: number; // 1–31, the day-of-month (clamped to month length at post time)
  intervalMonths: number; // 1 = monthly, 12 = yearly
  month: number | null; // 1–12 = a yearly rule's renewal month; null = monthly
  totalCount: number | null; // installment length, or null = open-ended subscription
};

export type CatalogData = {
  version: 1 | 2;
  categories: CategoryCatalogRow[];
  accounts: AccountCatalogRow[];
  recurrences: RuleCatalogRow[]; // always present in the in-memory shape; [] for a v1 source file
};
```

Dropped from the DB row on export: `id`, `lastPosted`, `startDate`, `startSeq`, `archived`. `version`
is written as `2`; `parseCatalogJson` accepts `1` or `2` and fills `recurrences` with `[]` when the
source is v1 or omits the key — that is the backward-compatibility guarantee for existing backups.
A malformed `recurrences` row makes the whole parse return `null`, matching the existing all-or-nothing
validation for categories/accounts.

## Import semantics

`ImportCatalog` restores the three arrays in dependency order so a rule's category/account exist
(with their proper emoji/hue) before rules resolve them:

1. `restoreCategoryCatalog` — upsert by name (unchanged).
2. `restoreAccountCatalog` — upsert by name (unchanged).
3. `restoreRecurrencesFromCatalog(db, rows, todayIso)` — new.

`restoreRecurrencesFromCatalog`, for each row:

- If a rule with that `name` already exists, **skip it** — never edit or delete a running rule.
- Otherwise resolve `category`/`account` names to ids (`categoryIdFor`/`accountIdFor`, which create a
  missing one), compute `startDate` as the next occurrence from `todayIso` (monthly → next `day`;
  yearly → next `month`/`day`), and insert with `lastPosted = null`, `startSeq = 1`.

This yields the catalog's three defining traits for rules too: **non-destructive** (never deletes or
edits an existing rule), **idempotent** (re-importing the same file adds nothing), and **fresh** (an
inserted rule starts from its next due date).

Known ceiling: an existing rule is skipped, not updated, so import can't push a config edit onto a
running rule, and two rules sharing a name can't both import. Accepted — the primary use case restores
onto an empty target, and update-on-conflict risks disturbing a running rule's posting anchor.

## Architecture

Mirrors the catalog wiring; the fold touches the same seams plus one new query.

- **`src/features/settings/catalog.ts`** — add `RuleCatalogRow` + `isRuleRow` guard; add `recurrences`
  to `CatalogData`; `parseCatalogJson` accepts `version` 1 or 2 and defaults `recurrences` to `[]`
  when absent. Stays pure (no DB, no fs) so it remains unit-testable. This is the one place the catalog
  module now encodes a rule's shape — the accepted cost of folding.
- **`src/features/recurring/queries.ts`** — `getRuleCatalog(db): Promise<RuleCatalogRow[]>` (active
  rules, joined to category/account NAMES, with `month` derived from `startDate` for yearly rules) and
  `restoreRecurrencesFromCatalog(db, rows, todayIso)` (the insert-if-absent logic above).
- **`src/features/recurring/schedule.ts`** — extract the "next occurrence of (day) or (month, day)
  from today" helper currently living inside `rule-form.ts`'s `resolveStartDate`/`nextOccurrence`, so
  import and the form compute the first due date from ONE implementation rather than duplicating it.
  `rule-form.ts` then imports it too.
- **`src/features/settings/use-backup-data.ts`** — read `getRuleCatalog(db)` alongside the category/
  account reads and include `recurrences` in the serialized JSON. Re-serializes on `bumpDataVersion`,
  as it already does, so a wipe/restore can't leave a stale file behind.
- **`src/features/settings/ui/ImportCatalog.tsx`** — after the category/account restores, call
  `restoreRecurrencesFromCatalog(db, data.recurrences, todayIso())`. Toast becomes "Categories,
  accounts & rules restored."

No new file, no new button; the existing Export/Restore pair now carries all three configs.

## Data flow

**Export:** `/settings` mount → `useBackupData` reads categories + accounts + active rules → composes
`{ version: 2, categories, accounts, recurrences }` → `serializeCatalogJson` → the same `.txt`
(text/plain) file the catalog already ships → share sheet or download.

**Import:** file picked → `file.text()` → `parseCatalogJson` (null on malformed → error toast) →
`restoreCategoryCatalog` → `restoreAccountCatalog` → `restoreRecurrencesFromCatalog` → `bumpDataVersion`
→ toast. `/recurring` refetches and the rules appear.

## Error handling

- Malformed file (bad JSON, wrong version, any malformed row) → `parseCatalogJson` returns `null` →
  "Couldn't read that file — is it a moniflow catalog JSON?" (existing behaviour, unchanged).
- A restore that throws mid-way → the existing try/catch toasts "Couldn't restore… try again". Rules
  restore after categories/accounts, so a rule failure can't corrupt the (already-committed) catalog
  restore; the user re-runs.
- A rule row referencing a category/account name not in the file's arrays → `categoryIdFor`/
  `accountIdFor` create it (a bare row with default emoji/hue), so the rule always resolves. This is
  the same auto-create the keypad relies on.

## Testing

Pure serialize/parse (`settings/catalog.test.ts`):

- v2 round-trip: serialize a `CatalogData` with rules, parse it back, get the same rules.
- **v1 backward compat**: a version-1 file (no `recurrences` key) parses to `recurrences: []`, not
  `null`. This is the guarantee that existing backups still restore.
- a malformed rule row → whole parse returns `null` (all-or-nothing, like the category/account guards).
- a version other than 1 or 2 → `null`.

Query layer (`recurring/queries.test.ts`, Node shim):

- `getRuleCatalog` returns active rules by name-joined shape, excludes archived, derives `month` from
  a yearly rule's `startDate` and leaves it null for a monthly rule.
- `restoreRecurrencesFromCatalog` inserts a fresh rule (`lastPosted` null, `startSeq` 1, `startDate` =
  next occurrence) and resolves category/account names to ids.
- **idempotence**: importing rows whose names already exist inserts nothing (skip), so a double import
  yields one rule, not two.
- a yearly row reconstructs the correct renewal month in `startDate`.
- category/account auto-created when the name is absent.

Extracted next-occurrence helper: a direct test if not already fully covered through
`rule-form.test.ts`.

Per CLAUDE.md, tests prove the queries against the Node shim and never the browser — so the
export→wipe→re-import round trip must additionally be driven in a real browser at 412px before this is
done: export the catalog, wipe all data, restore the file, and confirm the rules reappear fresh and
post on their next due date (not back-posted).

## Known ceilings

- **Import skips existing rules, never updates them.** A config edit in the backup won't overwrite a
  running rule; two same-named rules can't both import. Accepted to keep import from disturbing a
  running rule's anchor.
- **Posting history does not travel.** An imported installment restarts from payment 1; a subscription
  starts from its next due date. Backing up rules is backing up the definition, not the progress.
- **The catalog module now knows the rule shape.** Folding rules into `catalog.ts` couples it to a
  feature it previously didn't reference. Accepted for the one-file backup the user chose; the
  DB-touching logic still lives in `recurring/queries.ts`, so `catalog.ts` stays pure.
