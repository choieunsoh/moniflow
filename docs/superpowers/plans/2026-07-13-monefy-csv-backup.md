# Monefy-CSV Backup & Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user export the whole ledger to a Monefy-compatible `.csv` (download) and restore it from such a file (upload, replace-all), all from `/settings`.

**Architecture:** A pure `serializeMonefyCsv` mirrors the existing pure `parseMonefyCsv` — the CSV `string` is the seam that lets a Google-Drive transport bolt on later without touching the core. Export is a GET Route Handler emitting the string with `Content-Disposition: attachment`; restore reads the file in-browser via `file.text()`, confirms via the existing `ConfirmDialog`, and calls a Server Action that parses and does a true replace-all (`restoreEntries`, distinct from the monefy-only `replaceEntries`).

**Tech Stack:** Next.js 16 App Router (Route Handlers, Server Actions), React 19 client components, better-sqlite3 + drizzle-orm, Vitest + @testing-library/react.

**Design doc:** `docs/superpowers/specs/2026-07-13-monefy-csv-backup-design.md`

**Conventions to honor (from CLAUDE.md):** no `any`/`as`/`!`/ts-comments; `type` over `interface`; `for..of` over `forEach`; `Intl` for all date formatting (never string surgery); each Server Action ends in `revalidatePath('/', 'layout')`. Before committing: `npm run format:files <changed>` then `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` — all must pass.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/entries/import.ts` | **Modify** — add `serializeMonefyCsv` + `MONEFY_HEADER` + private `toDdmmyyyy`/`csvField` helpers (the pure export half, co-located with its parse mirror) |
| `src/features/entries/import.test.ts` | **Modify** — serialize unit tests + serialize↔parse round-trip test |
| `src/features/entries/queries.ts` | **Modify** — add `restoreEntries` (true replace-all) |
| `src/features/entries/queries.test.ts` | **Modify** — `restoreEntries` tests (clears all sources; leaves budgets) |
| `src/features/entries/actions.ts` | **Modify** — add `importBackupAction(csvText)` |
| `src/app/settings/backup/export/route.ts` | **Create** — GET route: read ledger → serialize → download response |
| `src/features/settings/ui/ImportBackup.tsx` | **Create** — client restore flow (file → confirm → action → toast) |
| `src/features/settings/ui/ImportBackup.test.tsx` | **Create** — render/wiring test |
| `src/app/settings/page.tsx` | **Modify** — add "Backup" section; fix stale Danger-zone copy |

---

## Task 1: `serializeMonefyCsv` — the pure export half

**Files:**
- Modify: `src/features/entries/import.ts`
- Test: `src/features/entries/import.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/entries/import.test.ts` (it already imports from `./import`):

```ts
import { serializeMonefyCsv, MONEFY_HEADER } from './import';

describe('serializeMonefyCsv', () => {
  it('emits the exact Monefy header', () => {
    expect(serializeMonefyCsv([])).toBe(MONEFY_HEADER);
    expect(MONEFY_HEADER).toBe(
      'date,account,category,amount,currency,converted amount,currency,description',
    );
  });

  it('serializes a THB outflow: DD/MM/YYYY date, THB in both currency cols, note last', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'shopping',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'lotus',
      },
    ]);
    expect(csv.split('\n')[1]).toBe('15/01/2016,#KTC X VISA,shopping,-637,THB,-637,THB,lotus');
  });

  it('keeps the original currency + amount for a non-THB row (converted stays THB)', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2019-03-20',
        account: 'yen',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: null,
      },
    ]);
    expect(csv.split('\n')[1]).toBe('20/03/2019,yen,food,-1000,JPY,-230,THB,');
  });

  it('quotes a field that contains a comma and doubles embedded quotes', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2026-07-01',
        account: 'cash',
        category: 'food',
        amount: -50,
        currency: 'THB',
        originalAmount: -50,
        note: 'lunch, with "friends"',
      },
    ]);
    expect(csv.split('\n')[1]).toBe('01/07/2026,cash,food,-50,THB,-50,THB,"lunch, with ""friends"""');
  });

  it('falls back to THB currency and amount when original fields are null', () => {
    const csv = serializeMonefyCsv([
      {
        date: '2026-07-02',
        account: 'cash',
        category: 'food',
        amount: -12,
        currency: null,
        originalAmount: null,
        note: null,
      },
    ]);
    expect(csv.split('\n')[1]).toBe('02/07/2026,cash,food,-12,THB,-12,THB,');
  });
});

describe('serialize ↔ parse round-trip', () => {
  it('parseMonefyCsv(serializeMonefyCsv(rows)) recovers the entry fields', () => {
    const rows = [
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'shopping',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'lotus',
      },
      {
        date: '2019-03-20',
        account: 'yen',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: null,
      },
    ];
    const { entries } = parseMonefyCsv(serializeMonefyCsv(rows));
    expect(entries).toEqual([
      {
        date: '2016-01-15',
        account: '#KTC X VISA',
        category: 'shopping',
        amount: -637,
        currency: 'THB',
        originalAmount: -637,
        note: 'lotus',
        source: 'monefy',
      },
      {
        date: '2019-03-20',
        account: 'yen',
        category: 'food',
        amount: -230,
        currency: 'JPY',
        originalAmount: -1000,
        note: null,
        source: 'monefy',
      },
    ]);
  });
});
```

Note: `parseMonefyCsv` is already imported at the top of this test file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/entries/import.test.ts`
Expected: FAIL — `serializeMonefyCsv`/`MONEFY_HEADER` are not exported.

- [ ] **Step 3: Implement `serializeMonefyCsv` in `import.ts`**

Add to the TOP of `src/features/entries/import.ts` — change the existing import line to also bring in `EntryRow`:

```ts
import type { EntryInput, EntryRow } from './schema';
```

Then append at the END of `src/features/entries/import.ts`:

```ts
// The exact Monefy CSV header — the byte-for-byte inverse of what parseMonefyCsv reads. The 5th and
// 7th columns are both "currency": the source currency, then the THB home currency (constant).
export const MONEFY_HEADER =
  'date,account,category,amount,currency,converted amount,currency,description';

// 'YYYY-MM-DD' (UTC key) → 'DD/MM/YYYY'. UTC (not Bangkok) so it re-parses to the identical key via
// toIsoDate — a lossless round-trip. en-GB with 2-digit day/month + numeric year renders the slashes.
const ddmmyyyyFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});
function toDdmmyyyy(iso: string): string {
  return ddmmyyyyFmt.format(new Date(`${iso}T00:00:00Z`));
}

// Quote a CSV field only when it contains a comma, double-quote, or newline; embedded quotes doubled.
// Matches exactly what parseCsv round-trips.
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Only the columns the export reads — getEntries' EntryRow[] satisfies this structurally, and it keeps
// the unit tests from having to build a full EntryRow (id/time/accountId/… are irrelevant here).
type ExportRow = Pick<
  EntryRow,
  'date' | 'account' | 'category' | 'amount' | 'currency' | 'originalAmount' | 'note'
>;

// Pure ledger → Monefy CSV. Inverse of parseMonefyCsv. Amounts emitted plain (no thousands commas);
// parseCsv strips commas on the way back either way. `time` and `source` have no column in the format
// and are intentionally not serialized (see the design doc's fidelity caveats).
export function serializeMonefyCsv(rows: readonly ExportRow[]): string {
  const lines = [MONEFY_HEADER];
  for (const r of rows) {
    const currency = r.currency ?? 'THB';
    const original = r.originalAmount ?? r.amount;
    lines.push(
      [
        toDdmmyyyy(r.date),
        csvField(r.account),
        csvField(r.category),
        String(original),
        csvField(currency),
        String(r.amount),
        'THB',
        csvField(r.note ?? ''),
      ].join(','),
    );
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/entries/import.test.ts`
Expected: PASS (all serialize + round-trip tests green, existing parse tests still green).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/import.ts src/features/entries/import.test.ts
npm run typecheck && npm run lint
git add src/features/entries/import.ts src/features/entries/import.test.ts
git commit -m "feat(entries): add serializeMonefyCsv — the pure CSV export half" -m "Mirror of parseMonefyCsv; the CSV string is the seam a future Google Drive transport reuses. Round-trip test asserts serialize→parse recovers the entry fields."
```

---

## Task 2: `restoreEntries` — true replace-all query

**Files:**
- Modify: `src/features/entries/queries.ts`
- Test: `src/features/entries/queries.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/features/entries/queries.test.ts`. First add `restoreEntries` to the existing import block from `./queries` (the one that already imports `replaceEntries`, `addEntries`, `getEntries`). `addCategory`, `setBudget`, `getBudgets` are already imported at the top of this file.

```ts
describe('restoreEntries', () => {
  it('clears every entry (both sources) then inserts the backup set', () => {
    const d = db();
    addEntries(d, [
      { date: '2020-01-01', account: 'a', category: 'old-monefy', amount: -1, source: 'monefy' },
      { date: '2026-07-01', account: 'me', category: 'old-manual', amount: -9, source: 'manual' },
    ]);
    restoreEntries(d, [
      { date: '2026-07-10', account: 'cash', category: 'restored', amount: -5, source: 'monefy' },
    ]);
    const rows = getEntries(d);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('restored');
  });

  it('leaves budgets intact (a ledger restore is not a wipe)', () => {
    const d = db();
    addCategory(d, 'food');
    setBudget(d, 'food', 1000);
    restoreEntries(d, [{ date: '2026-07-10', account: 'cash', category: 'x', amount: -5 }]);
    expect(getBudgets(d)).toHaveLength(1);
  });

  it('inserts nothing but still clears when given an empty set', () => {
    const d = db();
    addEntries(d, [{ date: '2026-07-01', account: 'me', category: 'gone', amount: -9 }]);
    restoreEntries(d, []);
    expect(getEntries(d)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: FAIL — `restoreEntries` is not exported.

- [ ] **Step 3: Implement `restoreEntries`**

In `src/features/entries/queries.ts`, add directly BELOW the existing `replaceEntries` function (around line 112):

```ts
// True replace-all restore from a full backup: clears EVERY entry (all sources), then inserts the
// backup rows — atomic, chunked like replaceEntries. Distinct from replaceEntries (which clears only
// source='monefy' rows): a full restore must not leave old manual rows behind, or they'd duplicate the
// ones already present in the backup file. Only entries are touched — budgets and category metadata
// survive, so restoring the ledger never nukes standing config.
export function restoreEntries(db: Db, rows: EntryInput[]): void {
  const chunkSize = 500; // matches replaceEntries — stays under SQLite's bound-variable cap
  db.transaction((tx) => {
    tx.delete(entries).run();
    const resolved = toRows(tx, rows);
    for (let i = 0; i < resolved.length; i += chunkSize) {
      tx.insert(entries)
        .values(resolved.slice(i, i + chunkSize))
        .run();
    }
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/entries/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/entries/queries.ts src/features/entries/queries.test.ts
npm run typecheck && npm run lint
git add src/features/entries/queries.ts src/features/entries/queries.test.ts
git commit -m "feat(entries): add restoreEntries — true replace-all for backup restore" -m "Clears all entries (every source) then inserts, unlike the monefy-only replaceEntries. Prevents duplicating manual rows on restore; leaves budgets/categories intact."
```

---

## Task 3: `importBackupAction` — Server Action

**Files:**
- Modify: `src/features/entries/actions.ts`

No unit test: like every action in this file it calls `initDb()` with the default path (not injectable), so it isn't unit-tested — its logic is fully covered by Task 1 (`parseMonefyCsv`) and Task 2 (`restoreEntries`). Verified end-to-end in Task 6.

- [ ] **Step 1: Add the action**

In `src/features/entries/actions.ts`, add `parseMonefyCsv` to the import from `./import`... actually it currently imports `parseEntryForm` from `./entry-form`; add a new import line near the other `./` imports:

```ts
import { parseMonefyCsv } from './import';
```

Then add `restoreEntries` to the existing `import { ... } from './queries';` block. Append this action at the END of the file:

```ts
// Restore the entire ledger from a Monefy-compatible CSV (a moniflow export, or a real Monefy export).
// Replace-all: parse, then restoreEntries wipes every existing entry and loads the file's rows. The
// caller (ImportBackup) reads the file in the browser and confirms first. Returns counts so the client
// can toast a summary; a malformed/empty file makes parseMonefyCsv yield 0 entries — that still runs a
// (harmless) clear, so the client guards against an empty parse before calling (see Task 5).
export async function importBackupAction(
  csvText: string,
): Promise<{ imported: number; skipped: number }> {
  const db = initDb();
  ensureEntriesTable(db);
  const { entries, skipped } = parseMonefyCsv(csvText);
  restoreEntries(db, entries);
  revalidatePath('/', 'layout');
  return { imported: entries.length, skipped };
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no test to run for this task).

- [ ] **Step 3: Commit**

```bash
npm run format:files src/features/entries/actions.ts
git add src/features/entries/actions.ts
git commit -m "feat(entries): add importBackupAction for CSV restore" -m "Parses a Monefy CSV and restoreEntries-replaces the ledger, then revalidates. Returns {imported, skipped} for the client toast."
```

---

## Task 4: Export route handler (download)

**Files:**
- Create: `src/app/settings/backup/export/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/settings/backup/export/route.ts`:

```ts
// GET /settings/backup/export — streams the whole ledger as a Monefy-compatible CSV download.
// force-dynamic: reads better-sqlite3 per request (can't be prerendered), same as every page.
export const dynamic = 'force-dynamic';

import { initDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { todayIso } from '@shared/date';

export function GET(): Response {
  const db = initDb();
  ensureEntriesTable(db);
  const csv = serializeMonefyCsv(getEntries(db));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="moniflow-${todayIso()}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Verify it typechecks and lints**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Manually verify the download**

Run: `npm run dev:web` (serves 127.0.0.1:4010), then in a browser open `http://127.0.0.1:4010/settings/backup/export`.
Expected: browser downloads `moniflow-YYYY-MM-DD.csv`; first line is the Monefy header; each row is a ledger entry. (Stop the dev server after.)

- [ ] **Step 4: Commit**

```bash
npm run format:files src/app/settings/backup/export/route.ts
git add src/app/settings/backup/export/route.ts
git commit -m "feat(app): add GET /settings/backup/export CSV download route" -m "Serializes the ledger via serializeMonefyCsv and returns it with Content-Disposition so the browser saves moniflow-YYYY-MM-DD.csv. No client JS needed."
```

---

## Task 5: `ImportBackup` client component (restore flow)

**Files:**
- Create: `src/features/settings/ui/ImportBackup.tsx`
- Test: `src/features/settings/ui/ImportBackup.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/settings/ui/ImportBackup.test.tsx` (mirrors `WipeAllData.test.tsx`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@features/entries/actions', () => ({
  importBackupAction: vi.fn(() => Promise.resolve({ imported: 3, skipped: 1 })),
}));
vi.mock('@shared/ui/toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), action: vi.fn() });
  return { toast };
});

import { ImportBackup } from './ImportBackup';
import { importBackupAction } from '@features/entries/actions';
import { toast } from '@shared/ui/toast';

function stubDialog() {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}

// A File whose .text() resolves to the given CSV (jsdom's File.text can be flaky — stub it explicitly).
function csvFile(text: string): File {
  const file = new File([text], 'backup.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

const SAMPLE =
  'date,account,category,amount,currency,converted amount,currency,description\n' +
  '15/01/2016,cash,food,-637,THB,-637,THB,lunch';

describe('ImportBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDialog();
  });

  it('picking a file opens the confirm dialog', async () => {
    render(<ImportBackup />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('open')).toBe(false);
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [csvFile(SAMPLE)] } });
    await waitFor(() => expect(dialog.hasAttribute('open')).toBe(true));
  });

  it('confirming calls importBackupAction with the file text and toasts a summary', async () => {
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [csvFile(SAMPLE)] } });
    await waitFor(() => expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(importBackupAction).toHaveBeenCalledWith(SAMPLE));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Restored 3 entries (1 skipped)'));
  });

  it('error-toasts when the action rejects', async () => {
    vi.mocked(importBackupAction).mockRejectedValueOnce(new Error('boom'));
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [csvFile(SAMPLE)] } });
    await waitFor(() => expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't read that backup — is it a Monefy CSV?"),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/features/settings/ui/ImportBackup.test.tsx`
Expected: FAIL — `./ImportBackup` does not exist.

- [ ] **Step 3: Implement `ImportBackup.tsx`**

Create `src/features/settings/ui/ImportBackup.tsx`:

```tsx
'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { importBackupAction } from '@features/entries/actions';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';
import { toast } from '@shared/ui/toast';

// Restore the ledger from a Monefy-compatible CSV. The file is read in the browser (file.text()) so
// the Server Action takes a plain string — no multipart plumbing. Confirm fires AFTER a file is picked
// (never before): the destructive replace-all only becomes actionable once a valid replacement is in
// hand, so a cancelled picker costs nothing. Mirrors WipeAllData's confirm+toast pattern.
export function ImportBackup() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked later
    if (!file) return;
    setPending(await file.text());
  }

  async function handleConfirm(): Promise<void> {
    if (pending === null) return;
    try {
      const { imported, skipped } = await importBackupAction(pending);
      toast(`Restored ${imported} entries (${skipped} skipped)`);
    } catch {
      toast.error("Couldn't read that backup — is it a Monefy CSV?");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost w-fit"
        onClick={() => inputRef.current?.click()}
      >
        Restore from backup
      </button>
      <input
        ref={inputRef}
        data-testid="backup-file"
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          void handleFile(e);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Replace everything with this backup?"
        body="This deletes all current entries and loads the file in their place. It cannot be undone."
        confirmLabel="Replace everything"
        destructive
        onConfirm={() => {
          void handleConfirm();
        }}
        onClose={() => setPending(null)}
      />
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/features/settings/ui/ImportBackup.test.tsx`
Expected: PASS (all three cases green).

- [ ] **Step 5: Commit**

```bash
npm run format:files src/features/settings/ui/ImportBackup.tsx src/features/settings/ui/ImportBackup.test.tsx
npm run typecheck && npm run lint
git add src/features/settings/ui/ImportBackup.tsx src/features/settings/ui/ImportBackup.test.tsx
git commit -m "feat(settings): add ImportBackup restore flow (file → confirm → action)" -m "Reads the CSV in-browser via file.text(), confirms via ConfirmDialog, calls importBackupAction, toasts the {imported, skipped} summary. Mirrors WipeAllData."
```

---

## Task 6: Wire the Backup section into `/settings`

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Add the imports**

In `src/app/settings/page.tsx`, add below the existing `WipeAllData` import (line 8):

```ts
import { ImportBackup } from '@features/settings/ui/ImportBackup';
```

- [ ] **Step 2: Add the Backup section and fix the stale Danger-zone copy**

Insert a new `<section>` immediately BEFORE the Danger-zone `<section>` (before line 119's `<section ... borderColor: 'var(--color-loss)'>`):

```tsx
      <section className="panel flex flex-col gap-3 p-5">
        <h2 className="text-sm font-semibold">Backup</h2>
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Export the whole ledger to a Monefy-compatible CSV, or restore it from one. Restoring
          replaces every current entry.
        </p>
        <a href="/settings/backup/export" download className="btn btn-ghost w-fit">
          Export CSV
        </a>
        <ImportBackup />
      </section>
```

Then, in the Danger-zone `<p>` (currently "Permanently delete every entry, category, and budget. This cannot be undone — there is no backup yet."), remove the now-false "— there is no backup yet" clause so it reads:

```tsx
        <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
          Permanently delete every entry, category, and budget. This cannot be undone.
        </p>
```

- [ ] **Step 3: Verify typecheck, lint, and the full test suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS across the board.

- [ ] **Step 4: Manually verify the round-trip end-to-end**

Run: `npm run dev:web`, open `http://127.0.0.1:4010/settings`.
1. Click **Export CSV** → a `moniflow-YYYY-MM-DD.csv` downloads.
2. Click **Restore from backup** → pick that CSV → the confirm dialog appears → click **Replace everything**.
3. Expect a "Restored N entries (M skipped)" toast, and `/records` unchanged (same data round-tripped).
(Stop the dev server after.)

- [ ] **Step 5: Commit**

```bash
npm run format:files src/app/settings/page.tsx
git add src/app/settings/page.tsx
git commit -m "feat(app): surface Backup (export + restore) on /settings" -m "Adds an Export CSV download link and the ImportBackup restore control above the Danger zone; drops the now-false 'there is no backup yet' line from the wipe copy."
```

---

## Self-Review

**Spec coverage** (each design section → task):
- Pure core `serializeMonefyCsv` + round-trip test → Task 1 ✅
- CSV format / header / column mapping / quoting / fidelity caveats (time & source dropped) → Task 1 (code + comments) ✅
- Export GET route + `Content-Disposition` + Bangkok filename → Task 4 ✅
- Restore replace-all + confirm + `file.text()` + toast copy → Task 5 ✅
- `importBackupAction(csvText) → {imported, skipped}` → Task 3 ✅
- `restoreEntries` true replace-all (distinct from `replaceEntries`, leaves budgets) → Task 2 ✅
- UI placement: Backup group above Danger zone → Task 6 ✅
- Resolved item: `toRows` auto-creates categories/accounts → relied on in Task 2/3, no extra step ✅
- Out of scope (Drive OAuth, merge, income export) → not built ✅

**Placeholder scan:** none — every code/test step carries full code and exact run commands.

**Type/name consistency:** `serializeMonefyCsv`, `MONEFY_HEADER`, `restoreEntries`, `importBackupAction`, `ImportBackup` used identically across tasks. Action returns `{ imported, skipped }`; component reads `{ imported, skipped }`; route uses `serializeMonefyCsv(getEntries(db))`. `ExportRow` is structurally satisfied by `EntryRow` (from `getEntries`). Confirm button label `Replace everything` matches between component and its test. File input reached via `data-testid="backup-file"` in both. All consistent.
