'use client';

import { useSyncExternalStore } from 'react';
import { subscribeDataVersion } from '@shared/data-version';
import { readConnection } from './connection';
import { isDriveConfigured } from './client-id';

// Settings read model for the Drive section: the localStorage connection + the config gate, exposed
// through useSyncExternalStore so a bumpDataVersion() (connect/disconnect/backup/restore all fire it)
// re-renders consumers WITHOUT a setState-in-effect. getServerSnapshot returns the disconnected default
// for the static export; DriveBackup only mounts client-side after Settings is ready, so no mismatch.
export type DriveStatus = {
  configured: boolean;
  connected: boolean;
  lastSyncedAt: number | null;
  needsReconnect: boolean;
};

const SERVER_SNAPSHOT: DriveStatus = {
  configured: false,
  connected: false,
  lastSyncedAt: null,
  needsReconnect: false,
};

// getSnapshot MUST return a stable reference until the underlying values change — a fresh object every
// call makes useSyncExternalStore loop forever. Cache keyed on the serialized value.
let cache: DriveStatus = SERVER_SNAPSHOT;
let cacheKey = '';

function getSnapshot(): DriveStatus {
  const c = readConnection();
  const configured = isDriveConfigured();
  const key = `${configured}|${c.connected}|${c.lastSyncedAt}|${c.needsReconnect}`;
  if (key !== cacheKey) {
    cacheKey = key;
    cache = {
      configured,
      connected: c.connected,
      lastSyncedAt: c.lastSyncedAt,
      needsReconnect: c.needsReconnect,
    };
  }
  return cache;
}

function getServerSnapshot(): DriveStatus {
  return SERVER_SNAPSHOT;
}

export function useDriveStatus(): DriveStatus {
  return useSyncExternalStore(subscribeDataVersion, getSnapshot, getServerSnapshot);
}
