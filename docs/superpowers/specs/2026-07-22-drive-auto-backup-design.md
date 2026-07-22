# Automatic Google Drive Backup (one-way, on-open) — Design

**Date:** 2026-07-22
**Status:** Design approved, pending spec review
**Scope:** One implementation plan.

## Purpose

Give moniflow **automatic off-device backup**: while connected, push the full ledger snapshot to the
user's Google Drive on app open (when stale) with **zero taps**, and restore from Drive in-app. This
is the fulfilment of the Drive-OAuth transport that
[`2026-07-13-monefy-csv-backup-design.md`](./2026-07-13-monefy-csv-backup-design.md) deliberately
deferred behind "the seam" (a backup is a `string`; every transport hands that string to the same
pure serialize/restore functions). Nothing structural was built for it then; this bolts onto that
seam.

It complements — does not replace — the local backup-safety layer shipped 2026-07-22
(`shared/backup-safety.ts`: persist OPFS + an overdue nudge). A successful Drive push stamps the same
`writeLastBackupAt()`, so the nudge and the More-tab dot clear on auto-backup too. The local nudge
becomes the honest fallback for "Drive isn't reaching through right now."

## Feasibility ceiling (why "on-open", not "3am nightly")

moniflow is `output: 'export'` — a static bundle, no server. So there is **no** server cron, no place
to safely hold a Google refresh token, no server-side background job. The web platform's only
"run while closed" hook is Periodic Background Sync: Chromium + installed-PWA only, browser-chosen
timing (not guaranteed daily), and **unsupported on iOS Safari**. Guaranteed unattended daily sync is
therefore impossible on iPhone and best-effort elsewhere.

The reliable, cross-platform design is **sync-on-open**, mirroring moniflow's existing rule
*"there is no server, so opening the app is the schedule"* (`useRecurringSweep`). "Daily" means
"daily if you open it daily" — which for a spending tracker is the normal case. Android Periodic
Background Sync is explicitly **out of scope for v1** (add later as a best-effort bonus if ever).

Drive access needs no server: Google Identity Services (GIS) token model, a **public** client ID
(no secret), scope `drive.file` (**non-sensitive → no Google app verification**). Access tokens last
~1h; a new one can be issued **silently only while the Google session is alive** in that browser — so
"occasional Reconnect" is an accepted, designed-for reality, never a blocking error.

## Decisions (locked during brainstorm)

- **Direction:** one-way **backup** (push), plus **in-app Restore from Drive** (pull). NOT two-way
  sync — no merge/conflict resolution over the SQLite ledger.
- **Path:** full Drive OAuth (GIS), connect/setup UI in the **Settings** menu.
- **Trigger:** on app open, if `> ~20h` since the last successful upload → silent push; plus a manual
  **"Back up now"** button. No Android background sync in v1.
- **Drive layout:** a **visible** `Moniflow Backups` folder, **dated** files
  (`moniflow-backup-YYYY-MM-DD.txt`), **keep last 14**, prune older. Grabbable by hand if the app ever
  breaks (matches moniflow's "your data in your hands" ethos); dated history so one bad push can't
  erase the good copy. Scope `drive.file`.
- **State home:** all per-device Drive state lives in **`localStorage`**, NOT the SQLite settings
  table — it must not be serialized into the backup blob or clobbered on restore (same reasoning as
  `moniflow-last-backup-at`). **No schema change**: `worker.ts` / `BOOTSTRAP_SQL` / schema-lockstep
  untouched.
- **Composition:** `backupNow()` also stamps the shared `writeLastBackupAt()` so the local overdue
  nudge + dot clear on Drive success.

## Architecture

A new self-contained feature module `src/features/drive/`. Dependency direction is
`drive → settings/entries/shared`, never the reverse — consistent with how
`settings/use-backup-data.ts` already reaches across features. The GIS script
(`https://accounts.google.com/gsi/client`) is **lazy-loaded on first connect only**, never on the
critical path.

### Files

| File | Purpose | Tested how |
|---|---|---|
| `sync-decision.ts` | **Pure heart.** `shouldAutoSync({connected, hasData, lastSyncedAt, now, staleHours}) → boolean` and `prunable(files, keep) → fileIds[]` | literals |
| `gis.ts` | Lazy-load the GIS client script; `requestToken({ silent }) → Promise<string>` (access token). Callback→promise bridge. The untestable glue. | mocked |
| `drive-api.ts` | Thin `fetch` wrappers over the Drive REST API given a token: `findOrCreateFolder`, `uploadBackup`, `listBackups`, `downloadFile`, `deleteFile` | mocked |
| `connection.ts` | `localStorage` state `{ connected, folderId?, lastSyncedAt?, needsReconnect? }` (key `moniflow-drive-connection`); `read/write/clear`. `needsReconnect` is stored (not in-memory) so the sync hook that sets it and the status hook that reads it — separate instances — see the same flag; set on silent-token failure, cleared on the next successful token | literals |
| `actions.ts` | Client orchestration: `connectDrive` · `disconnectDrive` · `backupNow` · `restoreFromDrive(fileId)` | node-proxy db + mocks |
| `use-drive-sync.ts` | App-wide hook mounted in `AppShell`: on open, if `shouldAutoSync` → silent token → push; degrade quietly on auth fail. Runs once per open (fire-and-forget). | renderHook |
| `use-drive-status.ts` | Settings read hook: `{ connected, lastSyncedAt, needsReconnect, syncing }`; recomputes on `useDataVersion()` | renderHook |
| `ui/DriveBackup.tsx` | Settings section: Connect/Disconnect, status line, "Back up now", "Restore from Drive" list/picker | browser |

### Targeted reuse refactor

Extract "build the backup text" out of `use-backup-data.ts` into a plain
`buildBackupText(db) → { text, counts }` (settings feature) so the share-sheet path **and** the Drive
push serialize identically — no duplicated six-read serialize. Likewise route Drive-restore through
the **existing** replace-all restore that `ui/ImportBackup.tsx` uses (extract a
`restoreFromBackupText(db, text)` if it isn't already reusable). This is a focused improvement to code
the feature touches, not unrelated refactoring.

## Data flow

- **Connect** (Settings tap): interactive GIS consent → access token →
  `findOrCreateFolder("Moniflow Backups")` → write connection `{connected:true, folderId}` → initial
  `backupNow()` → status shows connected + just-synced.
- **Auto-on-open** (`AppShell`, fire-and-forget like `useRecurringSweep`): read connection + `hasData`
  (reuses `hasAnyExpense`) + `lastSyncedAt` → `shouldAutoSync` true → **silent** token → `backupNow()`.
  Silent token fails → set `needsReconnect` then `bumpDataVersion()` so `use-drive-status` (keyed on
  `useDataVersion`) reflects it in Settings; do nothing else.
- **`backupNow()`**: `buildBackupText` → `uploadBackup` dated file → `listBackups` → delete
  `prunable(..., 14)` → write `lastSyncedAt = now` **and** `writeLastBackupAt(now)` → `bumpDataVersion()`.
- **Restore** (Settings): silent token → `listBackups` → user picks a dated file → `downloadFile` →
  `restoreFromBackupText` (replace-all) → `bumpDataVersion()` → toast "Restored N entries".

## Error handling — never block the app

| Situation | Behaviour |
|---|---|
| Silent token fails (session lapsed / consent revoked) | Set `needsReconnect`; auto-sync no-ops; local overdue nudge still covers. Settings shows "Reconnect Drive". |
| Network / Drive API failure on **auto** sync | Swallow; leave `lastSyncedAt` unchanged so it retries next open. |
| Failure on **manual** "Back up now" / restore | `toast.error(...)`; no partial state (restore reuses the existing transactional replace-all). |
| Empty ledger (`!hasData`) | Never uploads — nothing to lose (same gate as `backupStatus`). |
| GIS script blocked / offline at connect | Connect surfaces an error toast; app otherwise unaffected. |

Auto-sync must be strictly fire-and-forget: it never blocks first paint and never throws into render,
exactly like `requestPersistence()` and `useRecurringSweep()`.

## Testing

- **Pure (literals):** `shouldAutoSync` (connected×hasData×staleness matrix; backwards clock),
  `prunable` (keep-N boundary, fewer-than-N, dating).
- **Hooks (renderHook, node-proxy db + mocked `gis`/`drive-api`):** `use-drive-status` (state
  transitions), `use-drive-sync` (fires when stale+connected, no-ops when not, degrades on auth fail).
- **Actions:** `backupNow` (uploads, prunes, double-stamps timestamp, bumps), `restoreFromDrive`
  (downloads → replace-all → bump), `connectDrive`/`disconnectDrive`.
- **Browser (412px):** the Settings UI states — disconnected, connecting, connected + "synced Nm ago",
  needs-reconnect, syncing, restore picker. The real end-to-end Google flow is verified once by the
  user after the client ID is configured (can't be e2e'd without real Google creds).

## Setup & config (one-time, on the user)

1. Google Cloud project → OAuth consent screen (External, scope `.../auth/drive.file`) → **no
   verification needed** (non-sensitive scope).
2. Create an **OAuth client ID** (Web application). Authorized JavaScript origins:
   `https://mymoniflow.vercel.app` **and** `http://127.0.0.1:4010` (dev).
   ⚠️ `localhost` ≠ `127.0.0.1` — register whichever origin `npm run dev:web` actually serves (it is
   `127.0.0.1:4010`), the same origin gotcha OPFS has.
3. Expose it to the static build as `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

The whole Drive section is **inert/hidden when the env var is unset**, so nothing breaks for a build
without it (e.g. the ephemeral demo).

## Out of scope (YAGNI)

- Two-way sync / conflict resolution / merge.
- Android Periodic Background Sync (best-effort only anyway).
- Multi-account, multiple backup targets, encryption-at-rest beyond Drive's own.
- Rolling infinite history (capped at last 14).

## Defaults chosen (one-line knobs)

- Stale threshold **20h** (a daily open reliably re-triggers; tolerant of open-time drift).
- Retention **keep 14** dated backups.
