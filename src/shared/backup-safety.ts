// Device-local storage safety for an app whose only copy of the ledger lives in this browser's OPFS.
// Two honest halves: (1) ask the browser not to evict the data, and (2) track the last manual export
// so the app can quietly nudge when a backup is overdue. There is no silent auto-backup to a folder
// on a phone — the File System Access API is desktop-Chromium only — so this is the real ceiling.
//
// Lives in shared/ (not db/) on purpose: db/ is the sqlite-proxy seam and must stay feature-agnostic,
// while this is browser-storage plumbing consumed app-wide (the shell mount, the nav dot, Settings).

// ── Part 1: persist OPFS against eviction (fire-and-forget) ──────────────────────────────────────

// Ask the browser to keep OPFS from being evicted under storage pressure. On an installed PWA this is
// granted silently by engagement heuristics — no prompt; Firefox may ask. Idempotent and swallow-on-
// fail: a denied request is a weaker guarantee, not an error. Guarded because navigator.storage is
// absent on older/embedded webviews.
export async function requestPersistence(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  try {
    await navigator.storage.persist();
  } catch {
    // No persistence guarantee available — carry on unprotected.
  }
}

// Whether OPFS is currently in a non-evictable bucket, for the Settings "Storage: protected" line.
// False when unsupported.
export async function isStoragePersisted(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return false;
  try {
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

// ── Part 2: last-backup timestamp (localStorage, NOT the SQLite settings table) ───────────────────

// Per-device fact, not ledger data — so it must NOT live in the settings KV store, which the backup
// file serializes and a restore replaces. localStorage is per-origin, per-device, and survives a
// replace-all restore, which is exactly the semantics "when did THIS browser last export" wants.
const LAST_BACKUP_KEY = 'moniflow-last-backup-at';

// Epoch-ms of the last successful export, or null when never backed up / the stored value is unusable.
export function readLastBackupAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(LAST_BACKUP_KEY);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null; // never NaN
}

// Record a successful export. The only writer, and it always writes String(Date.now()), so the
// empty-string-reads-as-0 edge can't arise here.
export function writeLastBackupAt(now: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LAST_BACKUP_KEY, String(now));
}

// ── Part 3: the pure decision (the reusable heart — testable with literals) ───────────────────────

// How stale a backup gets before the app quietly says so. Days, not entries: one timestamp to store.
// Set just past the intended weekly habit (7 days) — a 3-day grace so a weekly backer who slips a day
// isn't nagged, while a genuinely skipped week (11+ days) does light the nudge. Keeps the signal rare,
// which is the only thing that keeps it meaningful.
export const OVERDUE_DAYS = 10;

export type BackupStatus = {
  // True only when there IS data to lose AND the last backup is missing or strictly older than
  // OVERDUE_DAYS. A fresh/empty ledger is never overdue — nothing to protect yet.
  overdue: boolean;
  // Whole local days since the last backup; null when never backed up. Floored at 0 so a backwards
  // clock never reads as a future backup.
  daysSince: number | null;
};

const MS_PER_DAY = 86_400_000;

// itemCount gates it so a fresh app is never nagged. No DOM, no DB — testable with literals.
export function backupStatus(
  lastBackupAt: number | null,
  now: number,
  itemCount: number,
): BackupStatus {
  if (lastBackupAt === null) return { overdue: itemCount > 0, daysSince: null };
  const daysSince = Math.max(0, Math.floor((now - lastBackupAt) / MS_PER_DAY));
  return { overdue: itemCount > 0 && daysSince > OVERDUE_DAYS, daysSince };
}

// How the backup age READS, kept separate from whether it should nudge. backupStatus answers
// "is this overdue"; this answers "what do we say", and the two diverge at the edges — 0 days is
// "today", not "0 days ago". Pure, so the About screen and any future caller word it identically.
export function backupSummary(status: BackupStatus): string {
  if (status.daysSince === null) return 'Never backed up';
  if (status.daysSince === 0) return 'Backed up today';
  if (status.daysSince === 1) return 'Backed up yesterday';
  return `Backed up ${status.daysSince} days ago`;
}
