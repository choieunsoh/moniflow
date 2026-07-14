'use client';
import { useSyncExternalStore } from 'react';

// Global mutation counter. Every successful OPFS write bumps it; read-hooks include useDataVersion() in
// their effect deps so they refetch. Single-user app, so a coarse "something changed → refetch all live
// reads" is correct and far simpler than per-query invalidation. Module-level (not React state) so a
// write in an action module can notify without a provider in the tree.
let version = 0;
const listeners = new Set<() => void>();

export function bumpDataVersion(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version, // server snapshot: stable 0 (no writes during SSR)
  );
}
