# Monefy-CSV Backup & Restore (with a clean seam for Google Drive) — Design

**Date:** 2026-07-13
**Status:** Design approved, pending spec review
**Scope:** One implementation plan.

## Purpose

Give moniflow **backup / portability**: export the full ledger to a Monefy-compatible `.csv`
(download), and restore the ledger from such a file (upload, replace-all). This is the local-first
app's own backup surface — not the ephemeral Vercel demo, not two-way sync with the Monefy app.

The Google Drive connection the request named is **deliberately deferred** to a later feature. This
design ships native file export/import now, structured so a real Drive-OAuth transport can bolt on
later **without touching the pure core** (see "The seam").

## Decisions (locked during brainstorm)

- **Core job:** backup / portability of moniflow's own data. Not persistence for the deploy, not
  Monefy two-way sync.
- **Drive now vs later:** native file download/upload now; real Drive OAuth deferred, with a clean
  seam so it bolts on later. (Off-device safety today comes for free via Drive Desktop or Monefy's
  own CSV sync watching the download folder — moniflow never touches Google's API in this feature.)
- **Restore semantics:** **replace-all + confirm.** Not merge/append (merge's dedup problem — no
  stable IDs in Monefy CSV — is a separate feature if ever needed).

## The seam (why Drive bolts on later without a rewrite)

The clean boundary is **not** a `BackupStore` interface with one implementation — that is exactly the
speculative machinery to avoid. The seam is a **stable data shape**: the backup lives as a `string`
(CSV text), and every transport hands that string to two pure functions:

- `parseMonefyCsv(text) → { entries, skipped }` — **already exists**.
- `serializeMonefyCsv(rows) → text` — **new**, its mirror image.

Local file today = a GET route emits the string / a file input reads the string. Drive later = a new
action fetches/puts the string via the Drive API and calls the **same** `serializeMonefyCsv` /
`parseMonefyCsv` + `restoreEntries`. Nothing structural blocks it; nothing speculative is built for
it now.

## CSV format

Header (exact, matches what `parseMonefyCsv` already reads):

```
date,account,category,amount,currency,converted amount,currency,description
```

Per-row mapping from an `EntryRow` (which carries joined category + account **names**):

| Column            | Source                                                            |
| ----------------- | ----------------------------------------------------------------- |
| `date`            | stored `YYYY-MM-DD` (UTC key) reformatted to `DD/MM/YYYY` via `Intl` |
| `account`         | account name                                                      |
| `category`        | category name                                                     |
| `amount`          | `originalAmount` (signed)                                         |
| `currency`        | `currency` (original)                                             |
| `converted amount`| `amount` (signed THB)                                             |
| `currency`        | `THB` (home currency, constant)                                   |
| `description`     | `note` (empty string when null)                                   |

Quoting: only fields containing a comma, double-quote, or newline are wrapped in `"..."` with
embedded quotes doubled — the same quoting `parseCsv` already round-trips. Amounts are emitted plain
(no thousands separators); `parseCsv` strips commas anyway, so plain re-parses cleanly.

### Fidelity caveats (accepted)

- **`time` is dropped.** The Monefy CSV format has no time column; moniflow's nullable `HH:MM` does
  not survive a round-trip. Low-stakes.
- **`source` collapses to `'monefy'`.** `parseMonefyCsv` stamps every re-imported row
  `source: 'monefy'` — the format has no source column, so the manual/monefy distinction can't
  survive a round-trip. `source` is informational only.
- **Expenses only.** moniflow stores only expenses, so the export is a *complete* backup of
  moniflow's data but not a full Monefy backup (no income). This matches the product ("spending
  tracker").

## Components & data flow

### 1. Pure core — `src/features/entries/import.ts`

Add `serializeMonefyCsv(rows: EntryRow[]): string` (+ a small shared CSV field-quoting helper reused
by both halves if it reads cleanly). Pure: no DB, no fs.

Tests in `import.test.ts`:
- serialize a THB row, a non-THB row, a row whose note contains a comma (quoting), an empty note.
- **round-trip**: build `EntryInput`s → serialize → `parseMonefyCsv` → assert equivalent entries
  back. This one test fails loudly if either half drifts.

### 2. Export (download) — `src/app/settings/backup/export/route.ts`

A GET Route Handler, `export const dynamic = 'force-dynamic'` (better-sqlite3 can't be prerendered).
Opens the DB, `getEntries`, `serializeMonefyCsv`, returns text with:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="moniflow-YYYY-MM-DD.csv"` (today's **Bangkok** date via
  `Intl`).

UI: a plain `<a href="/settings/backup/export" download>` styled as a button. No client JS, no
`Blob` juggling — the browser's `Content-Disposition` handling is the whole download path. Export
reflects the ledger at request time, so it is always current.

### 3. Restore (upload, replace-all + confirm) — `src/features/settings/ui/ImportBackup.tsx`

Client component mirroring `WipeAllData` (hidden file input + `ConfirmDialog` + `toast`):

1. "Restore from backup" button → hidden `<input type="file" accept=".csv,text/csv">`.
2. On pick, read in-browser via `file.text()` → hold string in state → open `ConfirmDialog`
   ("Replace everything with this backup? This deletes all current entries and cannot be undone.",
   `destructive`).
3. On confirm, call bound Server Action `importBackupAction(csvText)`.
4. On success: `toast('Restored N entries (M skipped)')`. On thrown parse error / garbage file:
   `toast.error("Couldn't read that backup — is it a Monefy CSV?")`.

Confirm fires **after** file selection, never before — the ledger is only destroyed once a valid
replacement is in hand; a cancelled picker costs nothing.

Test `ImportBackup.test.tsx`: render, file→confirm→action→toast path (mirrors `WipeAllData.test.tsx`).

### 4. Server Action — `src/features/entries/actions.ts`

`importBackupAction(csvText: string): Promise<{ imported: number; skipped: number }>`

```
parseMonefyCsv(csvText) → { entries, skipped }
restoreEntries(db, entries)
revalidatePath('/', 'layout')
return { imported: entries.length, skipped }
```

Entries owns its data ops (the arrow the CLI import already follows). A parse failure / empty file
throws; the client catches and shows the error toast.

### 5. New query — `src/features/entries/queries.ts`

`restoreEntries(db, rows: EntryInput[]): void` — a **true replace-all**, distinct from the existing
`replaceEntries`:

```
db.transaction((tx) => {
  tx.delete(entries).run();          // ALL sources, unconditional
  const resolved = toRows(tx, rows); // toRows auto-creates unknown categories/accounts
  // chunked insert (chunkSize 500), same as replaceEntries
});
```

**Why a new query, not `replaceEntries`:** `replaceEntries` deletes only `source = 'monefy'` rows and
keeps `manual` rows — correct for the CLI's "refresh the immutable Monefy export" job, but a restore
that reused it would leave existing hand-entered rows in place **and** re-insert them (now tagged
`monefy`) from the backup → every manual entry duplicated. `restoreEntries` deletes **only entries**
(all sources), leaving budgets and category metadata intact, so a ledger restore doesn't nuke
standing config. `replaceEntries` is left untouched.

Test in `queries.test.ts`: seed manual + monefy rows, `restoreEntries` with a new set, assert the old
rows (both sources) are gone and only the new set remains; assert budgets/categories untouched.

### 6. UI placement — `src/app/settings/page.tsx`

A new **"Backup"** group, above the existing **"Danger zone"**. Two rows: *Export* (download anchor),
*Restore from backup* (`ImportBackup`). Grouping the reversible backup ops together and keeping the
irreversible "Wipe all data" isolated in Danger zone keeps the destructive surface honest.

## File inventory

| File                                             | Change                                                    |
| ------------------------------------------------ | --------------------------------------------------------- |
| `src/features/entries/import.ts`                 | add `serializeMonefyCsv` (+ shared quoting helper)        |
| `src/features/entries/import.test.ts`            | add serialize + round-trip tests                          |
| `src/features/entries/queries.ts`                | add `restoreEntries` (true replace-all)                   |
| `src/features/entries/queries.test.ts`           | add `restoreEntries` test                                 |
| `src/features/entries/actions.ts`                | add `importBackupAction(csvText) → {imported, skipped}`   |
| `src/app/settings/backup/export/route.ts`        | new GET route handler (download)                          |
| `src/features/settings/ui/ImportBackup.tsx`      | new client component (restore flow)                       |
| `src/features/settings/ui/ImportBackup.test.tsx` | new render/wiring test                                    |
| `src/app/settings/page.tsx`                       | add Backup group surfacing export + restore              |

## Testing strategy

- **Pure logic carries the weight** (vitest): `serializeMonefyCsv`, the serialize↔parse round-trip,
  and `restoreEntries`' delete-all-then-insert semantics.
- `ImportBackup` gets a render test for the file→confirm→toast path (like `WipeAllData.test.tsx`).
- Export route is thin enough to leave to manual verification (`/settings/backup/export` downloads a
  well-formed CSV).

## Error handling

- Import parse failure / empty / non-CSV file → action throws → client catches → error toast. No
  partial writes (`restoreEntries` is a single transaction: delete + insert are atomic).
- Export needs no error path beyond the standard route behavior; an empty ledger yields a
  header-only CSV.

## Out of scope (YAGNI)

- Google Drive OAuth (the seam supports it later; separate feature).
- Merge / dedup import (separate feature — needs a duplicate rule Monefy CSV can't provide).
- Income / inflow export (product is spending-only).
- Per-cycle export, scheduled / automatic backups.

## Resolved during design

- **`toRows` auto-creates unknown categories/accounts** (`categoryIdFor`/`accountIdFor` upsert) —
  restore into an empty DB is lossless; no extra step needed.
- **`replaceEntries` is monefy-only, not replace-all** — hence the dedicated `restoreEntries` above.
