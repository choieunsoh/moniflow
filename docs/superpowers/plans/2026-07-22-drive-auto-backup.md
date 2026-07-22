# Automatic Google Drive Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let moniflow push a full-ledger backup to the user's Google Drive automatically on app open (when stale) and restore from Drive in-app — one-way, serverless, browser-only.

**Architecture:** A new self-contained `src/features/drive/` module. A pure decision core (`shouldAutoSync`, `prunable`) plus `localStorage` connection state, a lazy-loaded Google Identity Services (GIS) token bridge, thin Drive REST wrappers, client-side actions, two hooks (app-wide auto-sync + Settings status), and a Settings UI section. Reuses the existing catalog serialize (`serializeCatalogJson` via a new `buildBackupText`) and the existing replace-all restore (`restoreBackupAction`). No SQLite schema change.

**Tech Stack:** Next.js 16 static export · React 19 · TypeScript 5.9 strict · Google Identity Services (GIS) token model · Drive REST v3 · Vitest.

## Global Constraints

- **TS bans (lint errors):** no `any`, no `as`, no `!`, no `// @ts-*`; `type` over `interface`; `for..of` over `forEach`; `satisfies`+`as const` for config; `Intl` for date/number formatting.
- **No new SQLite table/column.** All Drive state is per-device in `localStorage`. Do NOT touch `src/db/worker.ts` `BOOTSTRAP_SQL` or `schema-lockstep.test.ts`.
- **Scope:** `https://www.googleapis.com/auth/drive.file` (non-sensitive).
- **Drive folder name:** `Moniflow Backups`. **Backup filename:** `moniflow-backup-YYYY-MM-DD.txt`. **Retention:** keep last **14**. **Stale threshold:** **20** hours.
- **Client ID:** build env `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; feature is inert/hidden when unset.
- **Fire-and-forget:** auto-sync never blocks first paint and never throws into render (like `requestPersistence()` / `useRecurringSweep()`).
- **Composition:** a successful push also calls `writeLastBackupAt(Date.now())` from `@shared/backup-safety` so the local overdue nudge + More-tab dot clear.
- **Quality gates before every commit:** `npm run format:files <changed>` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm test`. All green.
- **Commits:** `type(scope): subject` with repeated `-m` flags; scope `features` for `src/features/**`, `shared` for `src/shared/**`, `app` for `src/app/**`. End with the Co-Authored-By + Claude-Session trailers.

---

### Task 1: Pure sync-decision core + tunables

**Files:**
- Create: `src/features/drive/sync-decision.ts`
- Test: `src/features/drive/sync-decision.test.ts`

**Interfaces:**
- Produces: `shouldAutoSync(p: { connected: boolean; hasData: boolean; lastSyncedAt: number | null; now: number; staleHours: number }): boolean`; `prunable(files: DriveFile[], keep: number): string[]`; `type DriveFile = { id: string; name: string }`; consts `DRIVE_SCOPE`, `DRIVE_FOLDER_NAME`, `KEEP_BACKUPS`, `STALE_HOURS`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { shouldAutoSync, prunable, KEEP_BACKUPS } from './sync-decision';

const HOUR = 3_600_000;
const NOW = 1_700_000_000_000;
const base = { connected: true, hasData: true, now: NOW, staleHours: 20 };

test('does not sync when disconnected or empty', () => {
  expect(shouldAutoSync({ ...base, connected: false, lastSyncedAt: null })).toBe(false);
  expect(shouldAutoSync({ ...base, hasData: false, lastSyncedAt: null })).toBe(false);
});

test('syncs when never synced and there is data', () => {
  expect(shouldAutoSync({ ...base, lastSyncedAt: null })).toBe(true);
});

test('syncs only once past the stale threshold', () => {
  expect(shouldAutoSync({ ...base, lastSyncedAt: NOW - 19 * HOUR })).toBe(false);
  expect(shouldAutoSync({ ...base, lastSyncedAt: NOW - 20 * HOUR })).toBe(true);
});

test('a backwards clock never triggers a sync', () => {
  expect(shouldAutoSync({ ...base, lastSyncedAt: NOW + 5 * HOUR })).toBe(false);
});

test('prunable keeps the newest N dated files and returns the rest, newest-first-independent', () => {
  const files = [
    { id: 'c', name: 'moniflow-backup-2026-07-20.txt' },
    { id: 'a', name: 'moniflow-backup-2026-07-22.txt' },
    { id: 'b', name: 'moniflow-backup-2026-07-21.txt' },
  ];
  expect(prunable(files, 2)).toEqual(['c']); // keeps 22 & 21, prunes 20
  expect(prunable(files, 5)).toEqual([]); // fewer than keep → nothing pruned
  expect(KEEP_BACKUPS).toBe(14);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/drive/sync-decision.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// Pure decision core for Drive auto-backup — no DOM, no network, testable with literals.

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FOLDER_NAME = 'Moniflow Backups';
export const KEEP_BACKUPS = 14;
export const STALE_HOURS = 20;

export type DriveFile = { id: string; name: string };

const MS_PER_HOUR = 3_600_000;

// Push only when connected, there's data to lose, and either never synced or the last sync is at least
// staleHours old. A backwards clock (lastSyncedAt in the future) yields a negative age < staleHours → false.
export function shouldAutoSync(p: {
  connected: boolean;
  hasData: boolean;
  lastSyncedAt: number | null;
  now: number;
  staleHours: number;
}): boolean {
  if (!p.connected || !p.hasData) return false;
  if (p.lastSyncedAt === null) return true;
  return (p.now - p.lastSyncedAt) / MS_PER_HOUR >= p.staleHours;
}

// Dated filenames sort lexicographically = chronologically. Keep the newest `keep`, return the ids of
// the rest to delete. Copies before sorting so the caller's array is untouched.
export function prunable(files: DriveFile[], keep: number): string[] {
  const newestFirst = [...files].sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return newestFirst.slice(keep).map((f) => f.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/drive/sync-decision.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/drive/sync-decision.ts src/features/drive/sync-decision.test.ts
git commit -m "feat(features): pure decision core for Drive auto-backup" -m "shouldAutoSync + prunable, plus the folder/scope/retention/stale tunables. No DOM, no network." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 2: Per-device connection state (localStorage)

**Files:**
- Create: `src/features/drive/connection.ts`
- Test: `src/features/drive/connection.test.ts`

**Interfaces:**
- Produces: `type DriveConnection = { connected: boolean; folderId: string | null; lastSyncedAt: number | null; needsReconnect: boolean }`; `readConnection(): DriveConnection`; `writeConnection(c: DriveConnection): void`; `clearConnection(): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test, beforeEach } from 'vitest';
import { readConnection, writeConnection, clearConnection } from './connection';

const DEFAULT = { connected: false, folderId: null, lastSyncedAt: null, needsReconnect: false };

beforeEach(() => localStorage.clear());

test('reads a safe default when nothing is stored', () => {
  expect(readConnection()).toEqual(DEFAULT);
});

test('round-trips a written connection', () => {
  const c = { connected: true, folderId: 'fold1', lastSyncedAt: 123, needsReconnect: false };
  writeConnection(c);
  expect(readConnection()).toEqual(c);
});

test('a corrupt value reads as the default, never throws', () => {
  localStorage.setItem('moniflow-drive-connection', '{not json');
  expect(readConnection()).toEqual(DEFAULT);
});

test('clear resets to default', () => {
  writeConnection({ connected: true, folderId: 'f', lastSyncedAt: 1, needsReconnect: true });
  clearConnection();
  expect(readConnection()).toEqual(DEFAULT);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/drive/connection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
'use client';

// Per-device Drive connection state. localStorage (NOT the SQLite settings table): it must not be
// serialized into the backup blob or clobbered on restore — same reasoning as moniflow-last-backup-at.
// needsReconnect is stored (not in-memory) so the sync hook that sets it and the status hook that
// reads it — separate instances — see the same flag.

export type DriveConnection = {
  connected: boolean;
  folderId: string | null;
  lastSyncedAt: number | null;
  needsReconnect: boolean;
};

const KEY = 'moniflow-drive-connection';
const DEFAULT: DriveConnection = {
  connected: false,
  folderId: null,
  lastSyncedAt: null,
  needsReconnect: false,
};

function isConnection(v: unknown): v is DriveConnection {
  if (typeof v !== 'object' || v === null) return false;
  const connected = 'connected' in v ? v.connected : undefined;
  const folderId = 'folderId' in v ? v.folderId : undefined;
  const lastSyncedAt = 'lastSyncedAt' in v ? v.lastSyncedAt : undefined;
  const needsReconnect = 'needsReconnect' in v ? v.needsReconnect : undefined;
  return (
    typeof connected === 'boolean' &&
    (folderId === null || typeof folderId === 'string') &&
    (lastSyncedAt === null || typeof lastSyncedAt === 'number') &&
    typeof needsReconnect === 'boolean'
  );
}

export function readConnection(): DriveConnection {
  if (typeof window === 'undefined') return DEFAULT;
  const raw = localStorage.getItem(KEY);
  if (raw === null) return DEFAULT;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isConnection(parsed) ? parsed : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function writeConnection(c: DriveConnection): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(c));
}

export function clearConnection(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/drive/connection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/drive/connection.ts src/features/drive/connection.test.ts
git commit -m "feat(features): per-device Drive connection state in localStorage" -m "Stored not in the settings table so it can't ride along in the backup or be clobbered on restore. Corrupt/absent reads as a safe default." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 3: Client-ID config gate

**Files:**
- Create: `src/features/drive/client-id.ts`
- Test: `src/features/drive/client-id.test.ts`

**Interfaces:**
- Produces: `GOOGLE_CLIENT_ID: string`; `isDriveConfigured(): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { isDriveConfigured, GOOGLE_CLIENT_ID } from './client-id';

// In the test env NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset, so the feature reads as unconfigured.
test('unconfigured when the env var is absent', () => {
  expect(GOOGLE_CLIENT_ID).toBe('');
  expect(isDriveConfigured()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/drive/client-id.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// The OAuth client id is public and injected at build time. Empty when unset → the whole Drive
// feature is inert/hidden, so a build without it (e.g. the ephemeral demo) is unaffected.
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID !== '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/drive/client-id.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/drive/client-id.ts src/features/drive/client-id.test.ts
git commit -m "feat(features): Drive client-id config gate" -m "Public OAuth client id via NEXT_PUBLIC_GOOGLE_CLIENT_ID; the feature is inert when unset." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 4: Extract `buildBackupText` (shared serialize) + rewire `use-backup-data`

**Files:**
- Create: `src/features/settings/backup-payload.ts`
- Create: `src/features/settings/backup-payload.test.ts`
- Modify: `src/features/settings/use-backup-data.ts`

**Interfaces:**
- Consumes: existing `serializeCatalogJson` (`@features/settings/catalog`), `serializeMonefyCsv` (`@features/entries/import`), `getEntries`/`getCategoryCatalog`/`getAccountCatalog`/`getRuleCatalog`/`getBudgetCatalog`/`getAllSettings`.
- Produces: `type BackupPayload = { text: string; entryCount: number; categoryCount: number; accountCount: number; budgetCount: number }`; `buildBackupText(db: Db): Promise<BackupPayload>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from './schema';
import { restoreEntries } from '@features/entries/queries';
import { parseCatalogJson } from './catalog';
import { buildBackupText } from './backup-payload';

const ENTRY = { date: '2026-07-15', account: 'Cash', category: 'Coffee', amount: -12000, currency: 'THB', description: '' } as const;

describe('buildBackupText', () => {
  beforeEach(async () => {
    // fresh db per test
  });

  it('builds a v3 combined backup with the whole ledger and correct counts', async () => {
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    await ensureBudgetsTable(db);
    await ensureSettingsTable(db);
    await restoreEntries(db, [ENTRY]);

    const payload = await buildBackupText(db);
    expect(payload.entryCount).toBe(1);
    const parsed = parseCatalogJson(payload.text);
    if (parsed === null) throw new Error('expected a valid v3 backup');
    expect(parsed.version).toBe(3);
    expect(parsed.entriesCsv).toContain('Coffee');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/settings/backup-payload.test.ts`
Expected: FAIL — `buildBackupText` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/settings/backup-payload.ts`:

```ts
import type { Db } from '@db/client';
import { getEntries } from '@features/entries/queries';
import { serializeMonefyCsv } from '@features/entries/import';
import { getCategoryCatalog } from '@features/categories/queries';
import { getAccountCatalog } from '@features/accounts/queries';
import { getRuleCatalog } from '@features/recurring/queries';
import { getBudgetCatalog } from '@features/budgets/queries';
import { getAllSettings } from './queries';
import { serializeCatalogJson } from './catalog';

// The one place that assembles moniflow's combined (v3) backup text. Both the share-sheet export
// (use-backup-data) and the Drive push read it, so they serialize identically.
export type BackupPayload = {
  text: string;
  entryCount: number;
  categoryCount: number;
  accountCount: number;
  budgetCount: number;
};

export async function buildBackupText(db: Db): Promise<BackupPayload> {
  const [rows, categories, accounts, recurrences, budgets, settings] = await Promise.all([
    getEntries(db),
    getCategoryCatalog(db),
    getAccountCatalog(db),
    getRuleCatalog(db),
    getBudgetCatalog(db),
    getAllSettings(db),
  ]);
  const text = serializeCatalogJson({
    version: 3,
    categories,
    accounts,
    recurrences,
    entriesCsv: serializeMonefyCsv(rows),
    budgets,
    settings,
  });
  return {
    text,
    entryCount: rows.length,
    categoryCount: categories.length,
    accountCount: accounts.length,
    budgetCount: budgets.length,
  };
}
```

Then rewrite the effect body of `src/features/settings/use-backup-data.ts` to delegate. Replace the six `getXxx` imports + the inline `serializeCatalogJson` block with a single call. The effect becomes:

```ts
import { buildBackupText } from './backup-payload';
import { todayIso } from '@shared/date';
// ...remove the now-unused getEntries/serializeMonefyCsv/getCategoryCatalog/getAccountCatalog/
//    getRuleCatalog/getBudgetCatalog/getAllSettings/serializeCatalogJson imports...

  useEffect(() => {
    let live = true;
    void withDb(async (db) => {
      setReady(false);
      const payload = await buildBackupText(db);
      if (!live) return;
      const day = todayIso();
      setData({
        file: { name: `moniflow-backup-${day}.txt`, type: BACKUP_MIME, text: payload.text },
        entryCount: payload.entryCount,
        categoryCount: payload.categoryCount,
        accountCount: payload.accountCount,
        budgetCount: payload.budgetCount,
      });
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [version]);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/features/settings/backup-payload.test.ts src/features/settings/use-backup-data.test.ts`
Expected: PASS — the new test AND the existing `use-backup-data` tests (unchanged behaviour).

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/backup-payload.ts src/features/settings/backup-payload.test.ts src/features/settings/use-backup-data.ts
git commit -m "refactor(features): extract buildBackupText so export and Drive share one serializer" -m "The six-read v3 serialize moves out of use-backup-data into a reusable buildBackupText(db); the export hook now delegates. No behaviour change." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 5: GIS token bridge

**Files:**
- Create: `src/features/drive/gis.ts`
- Test: `src/features/drive/gis.test.ts`
- Modify: `package.json` (add dev dep `@types/google.accounts`)

**Interfaces:**
- Consumes: `GOOGLE_CLIENT_ID` (Task 3), `DRIVE_SCOPE` (Task 1).
- Produces: `requestToken(opts: { interactive: boolean }): Promise<string>` (resolves an access token, rejects on failure).

- [ ] **Step 1: Add the types-only dependency**

Run (Git Bash): `npm i -D @types/google.accounts`
This declares the ambient `google.accounts.oauth2` global so the code needs no `any`/`as`/`interface`.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { requestToken } from './gis';

// Pre-insert the GIS script so the loader resolves immediately, and stub the global token client.
describe('requestToken', () => {
  beforeEach(() => {
    for (const el of Array.from(document.querySelectorAll('script'))) el.remove();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    document.head.appendChild(s);
  });

  it('resolves the access token from the GIS callback', async () => {
    const initTokenClient = vi.fn((cfg: { callback: (r: { access_token?: string }) => void }) => ({
      requestAccessToken: () => cfg.callback({ access_token: 'tok-123' }),
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });

    await expect(requestToken({ interactive: false })).resolves.toBe('tok-123');
  });

  it('rejects when the callback returns no token', async () => {
    const initTokenClient = vi.fn((cfg: { callback: (r: { error?: string }) => void }) => ({
      requestAccessToken: () => cfg.callback({ error: 'access_denied' }),
    }));
    Reflect.set(globalThis, 'google', { accounts: { oauth2: { initTokenClient } } });

    await expect(requestToken({ interactive: true })).rejects.toThrow('access_denied');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- src/features/drive/gis.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
'use client';

import { GOOGLE_CLIENT_ID } from './client-id';
import { DRIVE_SCOPE } from './sync-decision';

// Lazy bridge to Google Identity Services. The GIS script is injected on first use only — never on
// the app's critical path. requestToken wraps the callback-based token client in a promise.
//
// Silent (interactive: false) uses prompt: '' — succeeds only while the user's Google session is alive
// and consent already granted; otherwise it rejects and the caller degrades to needsReconnect. The
// interactive path (prompt: 'consent') is used from the Connect / Back-up-now taps.

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (loading !== null) return loading;
  loading = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'));
      return;
    }
    if (document.querySelector(`script[src="${GIS_SRC}"]`) !== null) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return loading;
}

export async function requestToken(opts: { interactive: boolean }): Promise<string> {
  await loadGis();
  if (typeof google === 'undefined' || google.accounts?.oauth2 === undefined) {
    throw new Error('Google Identity Services unavailable');
  }
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.access_token !== undefined && resp.access_token !== '') resolve(resp.access_token);
        else reject(new Error(resp.error ?? 'no access token'));
      },
      error_callback: (err) => reject(new Error(err.type)),
    });
    client.requestAccessToken({ prompt: opts.interactive ? 'consent' : '' });
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/drive/gis.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/features/drive/gis.ts src/features/drive/gis.test.ts
git commit -m "feat(features): lazy GIS token bridge for Drive" -m "Injects the Google Identity Services script on first use and wraps the callback token client in a promise; silent vs interactive by prompt. Adds @types/google.accounts (types only)." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 6: Drive REST wrappers

**Files:**
- Create: `src/features/drive/drive-api.ts`
- Test: `src/features/drive/drive-api.test.ts`

**Interfaces:**
- Consumes: `DriveFile` (Task 1).
- Produces: `findOrCreateFolder(token: string, name: string): Promise<string>`; `uploadBackup(token: string, folderId: string, name: string, text: string): Promise<void>`; `listBackups(token: string, folderId: string): Promise<DriveFile[]>`; `downloadFile(token: string, fileId: string): Promise<string>`; `deleteFile(token: string, fileId: string): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findOrCreateFolder, uploadBackup, listBackups } from './drive-api';

function mockFetchOnce(json: unknown, ok = true): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(json), { status: ok ? 200 : 500 }),
  );
}

describe('drive-api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns an existing folder id without creating one', async () => {
    mockFetchOnce({ files: [{ id: 'fold1', name: 'Moniflow Backups' }] });
    expect(await findOrCreateFolder('tok', 'Moniflow Backups')).toBe('fold1');
    expect(fetch).toHaveBeenCalledTimes(1); // list only, no create
  });

  it('creates a folder when none exists', async () => {
    mockFetchOnce({ files: [] }); // list → empty
    mockFetchOnce({ id: 'newfold' }); // create → id
    expect(await findOrCreateFolder('tok', 'Moniflow Backups')).toBe('newfold');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('lists backups as {id,name}', async () => {
    mockFetchOnce({ files: [{ id: 'a', name: 'moniflow-backup-2026-07-22.txt' }] });
    expect(await listBackups('tok', 'fold1')).toEqual([
      { id: 'a', name: 'moniflow-backup-2026-07-22.txt' },
    ]);
  });

  it('updates in place when a file with the same name exists (one-per-day)', async () => {
    mockFetchOnce({ files: [{ id: 'existing', name: 'moniflow-backup-2026-07-22.txt' }] }); // find by name
    mockFetchOnce({ id: 'existing' }); // PATCH media
    await uploadBackup('tok', 'fold1', 'moniflow-backup-2026-07-22.txt', '{"v":3}');
    const calls = vi.mocked(fetch).mock.calls;
    expect(String(calls[1]?.[0])).toContain('/files/existing');
    expect(String(calls[1]?.[1]?.method)).toBe('PATCH');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/drive/drive-api.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// Thin wrappers over the Drive REST v3 API. Given an access token, do one thing each. No app logic —
// the pure decisions live in sync-decision.ts. JSON responses are narrowed via `unknown` + guards
// (no `as`, no `any`). `uploadBackup` upserts by name so a same-day re-backup replaces the day's file.

import type { DriveFile } from './sync-decision';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function driveFetch(token: string, url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Drive request failed: ${res.status}`);
  return res;
}

function readId(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }
  throw new Error('Drive response missing id');
}

function readFiles(body: unknown): DriveFile[] {
  if (typeof body !== 'object' || body === null || !('files' in body)) return [];
  const files = body.files;
  if (!Array.isArray(files)) return [];
  const out: DriveFile[] = [];
  for (const f of files) {
    if (
      typeof f === 'object' &&
      f !== null &&
      'id' in f &&
      'name' in f &&
      typeof f.id === 'string' &&
      typeof f.name === 'string'
    ) {
      out.push({ id: f.id, name: f.name });
    }
  }
  return out;
}

export async function findOrCreateFolder(token: string, name: string): Promise<string> {
  const q = encodeURIComponent(`name='${name}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const listed = await driveFetch(
    token,
    `${API}/files?q=${q}&spaces=drive&fields=files(id,name)`,
    { method: 'GET' },
  );
  const existing = readFiles(await listed.json());
  if (existing.length > 0 && existing[0] !== undefined) return existing[0].id;

  const created = await driveFetch(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  return readId(await created.json());
}

export async function listBackups(token: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(
    token,
    `${API}/files?q=${q}&orderBy=name desc&fields=files(id,name)`,
    { method: 'GET' },
  );
  return readFiles(await res.json());
}

export async function uploadBackup(
  token: string,
  folderId: string,
  name: string,
  text: string,
): Promise<void> {
  // One file per day: if today's file exists, replace its media; otherwise create a new one.
  const q = encodeURIComponent(`name='${name}' and '${folderId}' in parents and trashed=false`);
  const found = await driveFetch(
    token,
    `${API}/files?q=${q}&fields=files(id,name)`,
    { method: 'GET' },
  );
  const existing = readFiles(await found.json());

  if (existing.length > 0 && existing[0] !== undefined) {
    await driveFetch(token, `${UPLOAD}/files/${existing[0].id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain' },
      body: text,
    });
    return;
  }

  const boundary = 'moniflow-boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId] }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n` +
    text +
    `\r\n--${boundary}--`;
  await driveFetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export async function downloadFile(token: string, fileId: string): Promise<string> {
  const res = await driveFetch(token, `${API}/files/${fileId}?alt=media`, { method: 'GET' });
  return res.text();
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `${API}/files/${fileId}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/drive/drive-api.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/drive/drive-api.ts src/features/drive/drive-api.test.ts
git commit -m "feat(features): Drive REST wrappers (find/create folder, upsert, list, download, delete)" -m "One thing each; JSON narrowed via unknown+guards (no as/any). uploadBackup upserts by name so a same-day re-backup replaces the day's file." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 7: Actions — connect, disconnect, backupNow, restore

**Files:**
- Create: `src/features/drive/actions.ts`
- Test: `src/features/drive/actions.test.ts`

**Interfaces:**
- Consumes: `requestToken` (Task 5); `findOrCreateFolder`/`uploadBackup`/`listBackups`/`downloadFile`/`deleteFile` (Task 6); `readConnection`/`writeConnection`/`clearConnection` (Task 2); `prunable`/`DRIVE_FOLDER_NAME`/`KEEP_BACKUPS`/`DriveFile` (Task 1); `buildBackupText` (Task 4); `hasAnyExpense` (`@features/entries/queries`); `classifyBackup` + `restoreBackupAction` (`@features/settings/catalog`, `@features/settings/restore`); `writeLastBackupAt` (`@shared/backup-safety`); `getBrowserDb` (`@db/browser`); `todayIso` (`@shared/date`); `bumpDataVersion` (`@shared/data-version`).
- Produces: `connectDrive(): Promise<void>`; `disconnectDrive(): void`; `backupNow(opts: { interactive: boolean }): Promise<void>`; `listDriveBackups(): Promise<DriveFile[]>`; `restoreFromDrive(fileId: string): Promise<RestoreSummary>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { ensureCategoriesTable } from '@features/categories/schema';
import { ensureAccountsTable } from '@features/accounts/schema';
import { ensureRecurrencesTable } from '@features/recurring/schema';
import { ensureBudgetsTable } from '@features/budgets/schema';
import { ensureSettingsTable } from '@features/settings/schema';
import { restoreEntries } from '@features/entries/queries';
import { readConnection } from './connection';
import { readLastBackupAt } from '@shared/backup-safety';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
vi.mock('./gis', () => ({ requestToken: vi.fn() }));
vi.mock('./drive-api', () => ({
  findOrCreateFolder: vi.fn(),
  uploadBackup: vi.fn(),
  listBackups: vi.fn(),
  downloadFile: vi.fn(),
  deleteFile: vi.fn(),
}));

import { getBrowserDb } from '@db/browser';
import { requestToken } from './gis';
import { findOrCreateFolder, uploadBackup, listBackups, deleteFile } from './drive-api';
import { backupNow } from './actions';

const ENTRY = { date: '2026-07-15', account: 'Cash', category: 'Coffee', amount: -12000, currency: 'THB', description: '' } as const;

describe('backupNow', () => {
  beforeEach(async () => {
    localStorage.clear();
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await ensureCategoriesTable(db);
    await ensureAccountsTable(db);
    await ensureRecurrencesTable(db);
    await ensureBudgetsTable(db);
    await ensureSettingsTable(db);
    await restoreEntries(db, [ENTRY]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
    vi.mocked(requestToken).mockResolvedValue('tok');
    vi.mocked(findOrCreateFolder).mockResolvedValue('fold1');
    vi.mocked(uploadBackup).mockResolvedValue(undefined);
    vi.mocked(listBackups).mockResolvedValue([]);
    vi.mocked(deleteFile).mockResolvedValue(undefined);
  });

  it('uploads, stamps lastSyncedAt AND the local backup timestamp, and clears needsReconnect', async () => {
    await backupNow({ interactive: false });
    expect(uploadBackup).toHaveBeenCalledTimes(1);
    const conn = readConnection();
    expect(conn.connected).toBe(true);
    expect(conn.folderId).toBe('fold1');
    expect(conn.lastSyncedAt).not.toBeNull();
    expect(conn.needsReconnect).toBe(false);
    expect(readLastBackupAt()).not.toBeNull(); // local nudge cleared too
  });

  it('marks needsReconnect and rethrows when the silent token fails', async () => {
    vi.mocked(requestToken).mockRejectedValue(new Error('no session'));
    await expect(backupNow({ interactive: false })).rejects.toThrow('no session');
    expect(readConnection().needsReconnect).toBe(true);
    expect(uploadBackup).not.toHaveBeenCalled();
  });

  it('does nothing when the ledger is empty', async () => {
    const empty = makeNodeProxyDb();
    await ensureEntriesTable(empty);
    await ensureCategoriesTable(empty);
    await ensureAccountsTable(empty);
    await ensureRecurrencesTable(empty);
    await ensureBudgetsTable(empty);
    await ensureSettingsTable(empty);
    vi.mocked(getBrowserDb).mockResolvedValue(empty);
    await backupNow({ interactive: false });
    expect(uploadBackup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/drive/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
'use client';

import { getBrowserDb } from '@db/browser';
import { hasAnyExpense } from '@features/entries/queries';
import { classifyBackup } from '@features/settings/catalog';
import { restoreBackupAction, type RestoreSummary } from '@features/settings/restore';
import { buildBackupText } from '@features/settings/backup-payload';
import { writeLastBackupAt } from '@shared/backup-safety';
import { bumpDataVersion } from '@shared/data-version';
import { todayIso } from '@shared/date';
import { requestToken } from './gis';
import {
  findOrCreateFolder,
  uploadBackup,
  listBackups,
  downloadFile,
  deleteFile,
} from './drive-api';
import { readConnection, writeConnection, clearConnection } from './connection';
import { prunable, DRIVE_FOLDER_NAME, KEEP_BACKUPS, type DriveFile } from './sync-decision';

// Upload the current ledger with an already-obtained token, prune old backups, and stamp both the
// Drive lastSyncedAt and the shared last-backup timestamp (so the local overdue nudge/dot clear).
async function pushWith(token: string): Promise<void> {
  const db = await getBrowserDb();
  const conn = readConnection();
  const folderId = conn.folderId ?? (await findOrCreateFolder(token, DRIVE_FOLDER_NAME));
  const { text } = await buildBackupText(db);
  await uploadBackup(token, folderId, `moniflow-backup-${todayIso()}.txt`, text);
  const files = await listBackups(token, folderId);
  for (const id of prunable(files, KEEP_BACKUPS)) await deleteFile(token, id);
  const now = Date.now();
  writeConnection({ connected: true, folderId, lastSyncedAt: now, needsReconnect: false });
  writeLastBackupAt(now);
  bumpDataVersion();
}

export async function connectDrive(): Promise<void> {
  const token = await requestToken({ interactive: true });
  const db = await getBrowserDb();
  if (await hasAnyExpense(db)) {
    await pushWith(token);
  } else {
    const folderId = await findOrCreateFolder(token, DRIVE_FOLDER_NAME);
    const conn = readConnection();
    writeConnection({ ...conn, connected: true, folderId, needsReconnect: false });
    bumpDataVersion();
  }
}

export function disconnectDrive(): void {
  clearConnection();
  bumpDataVersion();
}

export async function backupNow(opts: { interactive: boolean }): Promise<void> {
  const db = await getBrowserDb();
  if (!(await hasAnyExpense(db))) return; // nothing to lose
  let token: string;
  try {
    token = await requestToken({ interactive: opts.interactive });
  } catch (err) {
    const conn = readConnection();
    writeConnection({ ...conn, needsReconnect: true });
    bumpDataVersion();
    throw err;
  }
  await pushWith(token);
}

export async function listDriveBackups(): Promise<DriveFile[]> {
  const token = await requestToken({ interactive: false });
  const conn = readConnection();
  const folderId = conn.folderId ?? (await findOrCreateFolder(token, DRIVE_FOLDER_NAME));
  return listBackups(token, folderId);
}

export async function restoreFromDrive(fileId: string): Promise<RestoreSummary> {
  const token = await requestToken({ interactive: false });
  const text = await downloadFile(token, fileId);
  const kind = classifyBackup(text);
  if (kind.kind !== 'combined' && kind.kind !== 'catalog') {
    throw new Error('That file is not a moniflow backup');
  }
  return restoreBackupAction(kind.data); // reuses replace-all + bumpDataVersion
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/drive/actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/drive/actions.ts src/features/drive/actions.test.ts
git commit -m "feat(features): Drive actions — connect, disconnect, backupNow, restore" -m "backupNow upserts today's file, prunes to last 14, and stamps both lastSyncedAt and writeLastBackupAt so the local nudge clears. Silent-token failure sets needsReconnect. Restore reuses the existing replace-all restoreBackupAction." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 8: `useDriveStatus` hook (Settings read model)

**Files:**
- Create: `src/features/drive/use-drive-status.ts`
- Test: `src/features/drive/use-drive-status.test.ts`

**Interfaces:**
- Consumes: `readConnection` (Task 2); `isDriveConfigured` (Task 3); `useDataVersion` (`@shared/data-version`).
- Produces: `type DriveStatus = { configured: boolean; connected: boolean; lastSyncedAt: number | null; needsReconnect: boolean }`; `useDriveStatus(): DriveStatus`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { writeConnection } from './connection';
import { bumpDataVersion } from '@shared/data-version';
import { useDriveStatus } from './use-drive-status';

describe('useDriveStatus', () => {
  beforeEach(() => localStorage.clear());

  it('reflects the stored connection and recomputes on data-version bump', async () => {
    const { result } = renderHook(() => useDriveStatus());
    await waitFor(() => expect(result.current.connected).toBe(false));

    act(() => {
      writeConnection({ connected: true, folderId: 'f', lastSyncedAt: 42, needsReconnect: true });
      bumpDataVersion();
    });
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.lastSyncedAt).toBe(42);
    expect(result.current.needsReconnect).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/drive/use-drive-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
'use client';

import { useEffect, useState } from 'react';
import { useDataVersion } from '@shared/data-version';
import { readConnection } from './connection';
import { isDriveConfigured } from './client-id';

// Settings read model for the Drive section. Pure localStorage read, recomputed on bumpDataVersion()
// — which connect/disconnect/backup/restore all fire — so the status line stays live.
export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  lastSyncedAt: number | null;
  needsReconnect: boolean;
};

export function useDriveStatus(): DriveStatus {
  const version = useDataVersion();
  const [status, setStatus] = useState<DriveStatus>({
    configured: isDriveConfigured(),
    connected: false,
    lastSyncedAt: null,
    needsReconnect: false,
  });

  useEffect(() => {
    const c = readConnection();
    setStatus({
      configured: isDriveConfigured(),
      connected: c.connected,
      lastSyncedAt: c.lastSyncedAt,
      needsReconnect: c.needsReconnect,
    });
  }, [version]);

  return status;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/drive/use-drive-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/drive/use-drive-status.ts src/features/drive/use-drive-status.test.ts
git commit -m "feat(features): useDriveStatus read model for Settings" -m "Reads the localStorage connection, recomputes on bumpDataVersion so the status line reflects connect/disconnect/backup/restore." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 9: `useDriveSync` hook (auto-on-open)

**Files:**
- Create: `src/features/drive/use-drive-sync.ts`
- Test: `src/features/drive/use-drive-sync.test.ts`

**Interfaces:**
- Consumes: `readConnection` (Task 2); `shouldAutoSync`/`STALE_HOURS` (Task 1); `withDb` (`@shared/db-effect`); `hasAnyExpense` (`@features/entries/queries`); `backupNow` (Task 7).
- Produces: `useDriveSync(): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { makeNodeProxyDb } from '@db/client';
import { ensureEntriesTable } from '@features/entries/schema';
import { restoreEntries } from '@features/entries/queries';
import { writeConnection } from './connection';

vi.mock('@db/browser', () => ({ getBrowserDb: vi.fn() }));
vi.mock('./actions', () => ({ backupNow: vi.fn() }));

import { getBrowserDb } from '@db/browser';
import { backupNow } from './actions';
import { useDriveSync } from './use-drive-sync';

const ENTRY = { date: '2026-07-15', account: 'Cash', category: 'Coffee', amount: -12000, currency: 'THB', description: '' } as const;

describe('useDriveSync', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(backupNow).mockReset().mockResolvedValue(undefined);
    const db = makeNodeProxyDb();
    await ensureEntriesTable(db);
    await restoreEntries(db, [ENTRY]);
    vi.mocked(getBrowserDb).mockResolvedValue(db);
  });

  it('pushes on open when connected, has data, and never synced', async () => {
    writeConnection({ connected: true, folderId: 'f', lastSyncedAt: null, needsReconnect: false });
    renderHook(() => useDriveSync());
    await waitFor(() => expect(backupNow).toHaveBeenCalledWith({ interactive: false }));
  });

  it('does not push when not connected', async () => {
    renderHook(() => useDriveSync());
    await new Promise((r) => setTimeout(r, 20));
    expect(backupNow).not.toHaveBeenCalled();
  });

  it('swallows a failing auto push (never throws into render)', async () => {
    vi.mocked(backupNow).mockRejectedValue(new Error('no session'));
    writeConnection({ connected: true, folderId: 'f', lastSyncedAt: null, needsReconnect: false });
    const { result } = renderHook(() => useDriveSync());
    await waitFor(() => expect(backupNow).toHaveBeenCalled());
    expect(result.current).toBeUndefined(); // hook returns void, no throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/drive/use-drive-sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
'use client';

import { useEffect } from 'react';
import { withDb } from '@shared/db-effect';
import { hasAnyExpense } from '@features/entries/queries';
import { readConnection } from './connection';
import { shouldAutoSync, STALE_HOURS } from './sync-decision';
import { backupNow } from './actions';

// App-open Drive sync. Mounted once in AppShell — "opening the app is the schedule" (like
// useRecurringSweep). Strictly fire-and-forget: reads connection + hasData, and if stale enough,
// silently pushes. Any failure (auth/network) is swallowed here — backupNow already recorded
// needsReconnect where relevant, and the local overdue nudge remains the visible fallback.
export function useDriveSync(): void {
  useEffect(() => {
    let alive = true;
    void (async () => {
      const conn = readConnection();
      if (!conn.connected) return;
      let hasData = false;
      await withDb(async (db) => {
        hasData = await hasAnyExpense(db);
      });
      if (!alive) return;
      if (
        !shouldAutoSync({
          connected: conn.connected,
          hasData,
          lastSyncedAt: conn.lastSyncedAt,
          now: Date.now(),
          staleHours: STALE_HOURS,
        })
      ) {
        return;
      }
      try {
        await backupNow({ interactive: false });
      } catch {
        // quiet degrade — see the comment above
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/drive/use-drive-sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/drive/use-drive-sync.ts src/features/drive/use-drive-sync.test.ts
git commit -m "feat(features): useDriveSync auto-backup on app open" -m "Fire-and-forget: pushes when connected + stale, swallows failures (backupNow owns needsReconnect). Mirrors useRecurringSweep's open-is-the-schedule." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

### Task 10: Settings UI + AppShell wiring + browser verification

**Files:**
- Create: `src/features/drive/ui/DriveBackup.tsx`
- Modify: `src/app/settings/page.tsx` (render `<DriveBackup />` in the Backup section)
- Modify: `src/shared/ui/AppShell.tsx` (call `useDriveSync()`)

**Interfaces:**
- Consumes: `useDriveStatus` (Task 8); `connectDrive`/`disconnectDrive`/`backupNow`/`listDriveBackups`/`restoreFromDrive` (Task 7); `DriveFile` (Task 1); `useDriveSync` (Task 9); `toast` (`@shared/ui/toast`); `ConfirmDialog` (`@shared/ui/ConfirmDialog`).
- Produces: `<DriveBackup />` React component (default-safe: renders nothing when `!configured`).

- [ ] **Step 1: Wire the auto-sync hook into AppShell**

In `src/shared/ui/AppShell.tsx`, add the import and call it alongside `useRecurringSweep()`:

```ts
import { useDriveSync } from '@features/drive/use-drive-sync';
// ...inside AppShell(), right after useRecurringSweep();
  // Push a Drive backup on open when connected + stale. Fire-and-forget, never blocks paint.
  useDriveSync();
```

- [ ] **Step 2: Build the Settings Drive section**

Create `src/features/drive/ui/DriveBackup.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useDriveStatus } from '../use-drive-status';
import {
  connectDrive,
  disconnectDrive,
  backupNow,
  listDriveBackups,
  restoreFromDrive,
} from '../actions';
import type { DriveFile } from '../sync-decision';
import { toast } from '@shared/ui/toast';
import { ConfirmDialog } from '@shared/ui/ConfirmDialog';

const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

// "N minutes/hours/days ago" from an epoch-ms, using Intl (no string math).
function agoLabel(at: number): string {
  const mins = Math.round((at - Date.now()) / 60_000);
  if (Math.abs(mins) < 60) return rel.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rel.format(hours, 'hour');
  return rel.format(Math.round(hours / 24), 'day');
}

export function DriveBackup() {
  const status = useDriveStatus();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<DriveFile[] | null>(null);
  const [confirmFile, setConfirmFile] = useState<DriveFile | null>(null);

  if (!status.configured) return null; // feature hidden without a client id

  async function run(fn: () => Promise<void>, okToast?: string): Promise<void> {
    setBusy(true);
    try {
      await fn();
      if (okToast !== undefined) toast(okToast);
    } catch {
      toast.error('Drive request failed — reconnect and try again');
    } finally {
      setBusy(false);
    }
  }

  async function openPicker(): Promise<void> {
    setBusy(true);
    try {
      setPicking(await listDriveBackups());
    } catch {
      toast.error('Could not list Drive backups — reconnect and try again');
    } finally {
      setBusy(false);
    }
  }

  async function doRestore(file: DriveFile): Promise<void> {
    setConfirmFile(null);
    setPicking(null);
    setBusy(true);
    try {
      const s = await restoreFromDrive(file.id);
      toast(
        s.entries === null
          ? `Restored ${s.categories} categories & ${s.accounts} accounts`
          : `Restored ${s.entries} entries, ${s.categories} categories, ${s.accounts} accounts & ${s.budgets} budgets`,
      );
    } catch {
      toast.error("Couldn't restore that Drive backup");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
      <h3 className="text-sm font-semibold">Google Drive</h3>

      {!status.connected ? (
        <>
          <p className="text-xs" style={{ color: 'var(--color-faint)' }}>
            Connect Google Drive to back up automatically when you open the app. Backups go to a
            &ldquo;Moniflow Backups&rdquo; folder you can see and download yourself.
          </p>
          <button
            type="button"
            className="btn btn-primary w-fit"
            disabled={busy}
            onClick={() => void run(connectDrive, 'Connected to Google Drive')}
          >
            {busy ? 'Connecting…' : 'Connect Google Drive'}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {status.needsReconnect
              ? 'Reconnect Drive — the connection lapsed.'
              : status.lastSyncedAt === null
                ? 'Connected. No backup yet.'
                : `Backed up to Drive ${agoLabel(status.lastSyncedAt)}.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost w-fit"
              disabled={busy}
              onClick={() => void run(() => backupNow({ interactive: true }), 'Backed up to Drive')}
            >
              Back up now
            </button>
            <button
              type="button"
              className="btn btn-ghost w-fit"
              disabled={busy}
              onClick={() => void openPicker()}
            >
              Restore from Drive
            </button>
            <button
              type="button"
              className="btn btn-ghost w-fit"
              disabled={busy}
              onClick={() => {
                disconnectDrive();
                toast('Disconnected from Drive');
              }}
            >
              Disconnect
            </button>
          </div>

          {picking !== null ? (
            <ul className="flex flex-col gap-1" data-testid="drive-picker">
              {picking.length === 0 ? (
                <li className="text-xs" style={{ color: 'var(--color-faint)' }}>
                  No backups in Drive yet.
                </li>
              ) : (
                picking.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="btn btn-ghost w-full justify-start"
                      onClick={() => setConfirmFile(f)}
                    >
                      {f.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmFile !== null}
        title="Replace everything with this Drive backup?"
        body="This deletes all current entries and loads the backup's in their place. Categories and accounts are merged in, never deleted. It cannot be undone."
        confirmLabel="Replace everything"
        destructive
        onConfirm={() => {
          if (confirmFile !== null) void doRestore(confirmFile);
        }}
        onClose={() => setConfirmFile(null)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Render it inside the Settings Backup section**

In `src/app/settings/page.tsx`, add the import and render `<DriveBackup />` at the end of the existing Backup `<section>` (right after `<ImportBackup />`):

```tsx
import { DriveBackup } from '@features/drive/ui/DriveBackup';
// ...at the end of the Backup <section>, after <ImportBackup />:
        <DriveBackup />
```

- [ ] **Step 4: Run the full gates**

```bash
npm run format:files src/features/drive/ui/DriveBackup.tsx src/app/settings/page.tsx src/shared/ui/AppShell.tsx
npm run typecheck && npm run lint && npm run format:check && npm test
```
Expected: all green (full suite).

- [ ] **Step 5: Browser verification at 412px (states without real Google)**

Start dev with a placeholder client id so the section renders:
```bash
NEXT_PUBLIC_GOOGLE_CLIENT_ID=placeholder.apps.googleusercontent.com npm run dev:web
```
Drive to `http://127.0.0.1:4010/settings` at 412px and confirm:
- The "Google Drive" section shows with a **Connect Google Drive** button (disconnected state).
- With no client id (`npm run dev:web`), the section is **absent** (inert when unconfigured).
- Force a connected state to check the status line + buttons render (in devtools console):
  `localStorage.setItem('moniflow-drive-connection', JSON.stringify({connected:true,folderId:'f',lastSyncedAt:Date.now()-3*3600000,needsReconnect:false})); location.reload()`
  → expect "Backed up to Drive 3 hours ago." + Back up now / Restore from Drive / Disconnect.
- Set `needsReconnect:true` similarly → expect "Reconnect Drive — the connection lapsed."

(The real OAuth round-trip is verified once by the user after a real client id is configured — it can't be exercised without Google credentials.)

- [ ] **Step 6: Commit**

```bash
git add src/features/drive/ui/DriveBackup.tsx src/app/settings/page.tsx src/shared/ui/AppShell.tsx
git commit -m "feat(features): Drive backup Settings UI + auto-sync on open" -m "Connect/status/back-up-now/restore-picker/disconnect in Settings (hidden when unconfigured); AppShell mounts useDriveSync so a connected app backs up on open. Restore reuses the destructive-replace ConfirmDialog." -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01R9LtMP5mnswJggfKUimS6g"
```

---

## Setup the user must do once (outside this plan)

1. Google Cloud Console → new project → OAuth consent screen (External; add scope `.../auth/drive.file`; no verification needed — non-sensitive).
2. Credentials → Create OAuth client ID → Web application. Authorized JavaScript origins: `https://mymoniflow.vercel.app` **and** `http://127.0.0.1:4010`.
3. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<the id>` in the Vercel project env and in a local `.env.local` for dev.

## Self-Review

**Spec coverage:** feasibility/on-open trigger → Task 9; one-way push → Task 7 `backupNow`; in-app restore → Task 7 `restoreFromDrive` + Task 10 picker; visible dated folder + keep-14 + upsert-per-day → Tasks 1/6/7; localStorage state, no schema change → Task 2; composition with local nudge (`writeLastBackupAt`) → Task 7; quiet degrade / needsReconnect → Tasks 7/9/10; client-id gate/inert-when-unset → Tasks 3/10; reuse serialize/restore → Tasks 4/7. All spec sections map to a task.

**Placeholder scan:** none — every code step carries complete code and exact commands.

**Type consistency:** `DriveFile {id,name}` (Task 1) used by drive-api/actions/UI; `DriveConnection` shape identical across connection/status/actions; `requestToken({interactive})` signature identical in gis/actions; `backupNow({interactive})`, `restoreFromDrive(fileId)`, `RestoreSummary` (from existing `restore.ts`) consistent across actions/UI. No drift.
