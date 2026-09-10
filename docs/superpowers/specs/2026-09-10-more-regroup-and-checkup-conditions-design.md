# More sheet regrouping + configurable Checkup conditions

Date: 2026-09-10
Status: approved, ready for planning

Two independent changes, one branch. Neither shares a file with the other.

A third item was explored and **dropped by the owner mid-session**: a show/hide toggle on
categories/accounts/currencies that would have hidden rows from the keypad pickers behind a
"Show all" button. It is recorded in "Dropped: picker visibility" below so the findings are not
re-derived next time.

---

## 1. More sheet regrouping

### Why

The sheet groups twelve tiles as Review (4) / Plan (2) / Set up (6). Three problems, all confirmed
by the owner:

1. **Checkup is filed under "Set up" for a layout reason, not a meaning.** The existing comment in
   `MoreSheet.tsx` says so outright: _"Six tiles fill two clean rows of the three-column grid."_
   Checkup is a data-quality scan that deletes ledger rows; it configures nothing.
2. **"Set up" at six tiles is too coarse** — it mixes the three lists the keypad picks from with
   app-level pages.
3. **The order contradicts actual use.** The owner's three most-opened destinations are Categories,
   Accounts and Currency, and today all three sit in the last group.

### The new grouping

| Group    | Tiles                                | Grid rows        |
| -------- | ------------------------------------ | ---------------- |
| `lists`  | Categories · Accounts · Currency     | 1 full row       |
| `review` | Year · Month · Report · Trips        | 1 full row + 1   |
| `plan`   | Budgets · Recurring                  | 1 short row      |
| `app`    | Settings · Checkup · About           | 1 full row       |

Row count is unchanged at five, so the sheet grows only by the height of one added caption
(~28px). No layout risk.

### Scope

`src/shared/ui/MoreSheet.tsx` only — the `GROUPS` constant and the block comment above it.

### Constraints that must survive

- **Per-tile `cycle` flags are unchanged.** Budgets stays `cycle: true`; every other tile stays
  `cycle: false`. Moving a tile between groups must not move its flag. Dropping `cycle: true` from
  Budgets silently loses the selected cycle on every tap.
- **The block comment above `GROUPS` must be rewritten, not merely edited.** It currently argues for
  the three-group layout ("Review leads because…", "Six tiles fill two clean rows"). Left in place it
  documents a layout that no longer exists.
- **Labels stay one short word.** The comment on the label `<span>` records the real constraint:
  "Categories" is the longest label that fits a three-column tile at 412px.
- Tiles, hrefs, icons and the `aria-labelledby` wiring are otherwise untouched.

### Verification

- Existing tests must stay green.
- Drive it in a browser at 412px: open the sheet, confirm four captions, confirm the sheet still
  fits without scrolling, and confirm Budgets still carries `?cycle=` when opened from a non-current
  cycle.

---

## 2. Configurable Checkup conditions

### Why

`findDuplicateGroups` hardcodes one rule: same date, same amount, same category. Account and note
are deliberately excluded, and `duplicates.ts` explains why (keying on account would hide the
exact mistake worth catching — one bill paid twice from two cards). That reasoning is sound as a
*default*, but it is the only rule available. The owner wants to choose which fields must match.

### The rule becomes an input

`findDuplicateGroups(rows, keys)` takes the set of fields that must match.

| Field    | Value compared                                  | Default  |
| -------- | ----------------------------------------------- | -------- |
| date     | `date`, exact string equality — no ±1 day window | checked  |
| amount   | `amount`, sign included                         | checked  |
| category | `categoryId`                                    | checked  |
| account  | `accountId`                                     | unchecked|
| note     | `note`, trimmed; null and `''` compare equal     | unchecked|

The default set reproduces today's behaviour exactly: open the page, press Scan, get the same
groups as before this change.

**Exact date only.** A ±1 day window was offered and declined. The existing comment's objection
stands: it flags the entirely normal case of the same coffee two mornings running, and on a surface
whose only affordance is Delete, a false positive costs more than a miss.

**Ids, not names, for category and account.** Matches what the function keys on today, and survives
a rename.

### Two consequential follow-ons

Both are correctness, not polish:

1. **Group ordering must stop parsing the key string.** Today the date is recovered with
   `key.slice(0, key.indexOf('|'))`, which assumes date is the first key segment. Unchecking "date"
   makes that expression return the amount and sort the list by a number-shaped string. Read `date`
   off the first row of the bucket instead. The bucket's rows may then hold different dates, which
   is correct and intended — the heading order is a display concern, not part of the key.
2. **Zero selected fields must be total.** With no fields selected every row shares one key and the
   whole ledger becomes a single group. `findDuplicateGroups` returns `[]` when `keys` is empty, and
   the UI disables the last remaining checkbox so the state is unreachable. Both, deliberately: the
   pure function has to be total because it is exported and tested; the UI guard keeps the dead-end
   off screen. Same shape as THB being unhideable on `/currency`.

### `DuplicateScan` holds rows, not groups

Today the component stores the computed `groups`. Changing a condition would therefore mean
re-reading the entire ledger over the worker RPC — ten thousand-plus rows — to recompute something
that is a pure function of data already in memory.

Store the scanned `rows` instead and derive groups with `useMemo` over `rows` and the selected keys.

- `rows === null` still means "not scanned"; `[]` still means "scanned and clean". The distinction
  drives the empty state and must survive.
- Deleting a row becomes `setRows(current => current.filter(r => r.id !== id))`, replacing the
  current re-derivation call.
- The undo path re-runs `scan()` for the same reason it does today.
- Toggling a checkbox after a scan re-groups instantly with no disk read. Toggling before a scan
  changes nothing on screen.

This removes a synchronisation duty rather than adding one — the class of bug fixed in v1.25.0,
where `groups` and the ledger drifted apart after an undo.

### `/checkup` page copy

The header currently states the fixed rule: _"Rows sharing a date, an amount and a category."_ Once
the rule is chosen on screen, that sentence is stale. Replace it with a general description of the
job; it must not name specific fields, because the checkboxes state the current rule themselves.

### State lifetime

The selected fields live in component state and reset to the default on every visit. They are not
written to the settings table. The scan is a rare, deliberate act, and a default that reproduces
today's behaviour is the right thing to land on each time.

### Scope

- `src/features/entries/duplicates.ts` — signature, key building, group ordering, empty-keys guard.
- `src/features/entries/duplicates.test.ts` — existing cases pass the default key set; new cases per
  field, plus empty-keys and note-normalisation.
- `src/features/entries/ui/DuplicateScan.tsx` — rows-not-groups, the checkbox row, the last-checkbox
  guard.
- `src/features/entries/ui/DuplicateScan.test.tsx` — condition toggling re-groups without a re-read.
- `src/app/checkup/page.tsx` — header copy.

### Verification

- `npm run typecheck`, `npm run lint`, `npm test` all green.
- Drive it in a browser at 412px against the real dev ledger: scan with the defaults and confirm the
  count matches what the page reports today (137 rows on this ledger, per the duplicate-scan
  memory); then tick "account" and confirm the count drops; then untick everything but one and
  confirm the last checkbox cannot be unticked.

---

## Dropped: picker visibility

Explored and dropped by the owner before a placement was chosen. Recorded so the findings survive.

The idea: a per-row show/hide toggle on `/categories`, `/accounts` and `/currency` controlling
whether a row appears in the keypad pickers, with a "Show all" control in the picker revealing the
hidden ones for selection.

What the exploration established, and what would have to be handled if it is ever revived:

- **`archived` already exists on all three tables** and needs no `COLUMN_MIGRATIONS` entry — it
  predates the `off_budget` migration. `categories/schema.ts` and `accounts/schema.ts` both say in
  comments that the column ships inert waiting for exactly this UI.
- **`currencies.archived` is not inert and is not a soft hide.** `getCurrencyCodes` excludes archived
  codes from entry validation, so hiding a currency today blocks new entries in it. A "Show all" that
  offers a hidden currency would produce a selection that fails to save. Softening it means widening
  that validation to `getAllCurrencyCodes`.
- **`AccountCatalogRow` has no `archived` field.** Starting to use the flag on accounts without
  adding one silently drops it on every restore to a fresh device — the same defect class as the
  off-budget tri-state before v1.8.1.
- **The row being edited must always appear even when hidden.** Otherwise opening an old entry whose
  category is now hidden loses its own category. `use-edit-entry.ts` already carries the currency
  version of this fix and documents it.
