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
