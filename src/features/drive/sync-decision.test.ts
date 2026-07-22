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
