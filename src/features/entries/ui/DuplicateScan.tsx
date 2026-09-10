'use client';

import { useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntries } from '../queries';
import { deleteEntryAction, undoDeleteEntry } from '../actions';
import { findDuplicateGroups } from '../duplicates';
import { toast } from '@shared/ui/toast';
import { formatLedgerSpend } from '@shared/money';
import { formatDayHeading } from '@shared/date';
import { Money } from '@shared/ui/Money';
import type { EntryRow } from '../schema';

// Date and category are two thirds of the grouping key, so every row in a group shares them by
// construction — a label built from just those two is identical for every button in a pair. Account
// is what actually tells the rows apart (it's excluded from the key on purpose, see duplicates.ts);
// fold the note in too when there is one, since two rows can also share an account. A genuine
// double-post matches on every field, so the position within the group must be included to
// distinguish two identical rows.
function rowDeleteLabel(entry: EntryRow, index: number, groupSize: number): string {
  const note = entry.note?.trim();
  const base = `Delete ${entry.category} on ${formatDayHeading(entry.date)}, ${entry.account}`;
  const withNote = note ? `${base}, ${note}` : base;
  return `${withNote}, ${index + 1} of ${groupSize}`;
}

// On demand, never on mount: the scan reads the entire ledger (the same read the backup export
// performs) and opening this page is not a reason to pay for it. `null` groups means "not scanned",
// `[]` means "scanned and clean" — collapsing those two would make the empty state indistinguishable
// from the initial one, and the whole value of the surface is the sentence "No duplicates found".
export function DuplicateScan() {
  const [groups, setGroups] = useState<EntryRow[][] | null>(null);
  // Per-row, not a single boolean: this screen shows many candidate rows at once, and deleting one
  // must not disable every other row's button — unlike SwipeRow, where one row IS the whole surface.
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  // Reads the WHOLE ledger over the worker RPC (10k+ rows) with nothing else on screen to say so,
  // and a second tap before the first read lands would stack concurrent reads. One boolean disables
  // the button and swaps its label for the duration; .finally so it clears whether withDb ran the
  // read, threw, or quietly no-opped because the db won't open.
  const [scanning, setScanning] = useState(false);

  function scan(): void {
    if (scanning) return;
    setScanning(true);
    void withDb(async (db) => {
      const rows = await getEntries(db);
      setGroups(findDuplicateGroups(rows));
    }).finally(() => setScanning(false));
  }

  // Delete, then offer the same Undo the Records swipe does (deleteEntryAction/undoDeleteEntry are
  // the same pairing, same snapshot). Re-run the scan over the rows already on screen minus the
  // deleted id rather than re-reading the whole ledger — every other row's group membership is
  // unaffected by one deletion, so this is exactly what a second read would produce. This path was
  // unreachable while the component lived on /settings, whose ready gate unmounted it on every
  // delete; on /checkup nothing above it un-mounts, so this is the update the user actually sees.
  async function remove(entry: EntryRow): Promise<void> {
    if (deletingIds.has(entry.id)) return;
    setDeletingIds((current) => new Set(current).add(entry.id));
    try {
      const snapshot = await deleteEntryAction(entry.id);
      if (!snapshot) {
        toast('Entry deleted');
      } else {
        toast.action('Entry deleted', {
          label: 'Undo',
          onClick: () => {
            // A successful undo puts the row back in the ledger, but `groups` was already re-derived
            // without it — a list that still shows the pair as resolved is lying. Undo is rare enough
            // that a full re-scan is the cheap, honest fix, cheaper than reconciling the restored row
            // back into state by hand.
            undoDeleteEntry(snapshot).then(
              () => scan(),
              () => toast.error('Failed to undo — try again'),
            );
          },
        });
      }
      setGroups((current) => {
        if (current === null) return current;
        const remaining = current.flat().filter((row) => row.id !== entry.id);
        return findDuplicateGroups(remaining);
      });
    } catch {
      toast.error('Couldn’t delete — try again');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(entry.id);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="btn btn-ghost w-fit disabled:opacity-60"
        disabled={scanning}
        onClick={scan}
      >
        {scanning ? 'Scanning…' : 'Scan for duplicates'}
      </button>
      {groups === null ? null : groups.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          No duplicates found
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li
              key={group.map((row) => row.id).join('-')}
              className="flex flex-col gap-2 rounded-[var(--radius-sm)] border p-3"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <ul className="flex flex-col gap-2">
                {group.map((entry, index) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        {formatDayHeading(entry.date)} · {entry.category} · {entry.account}
                      </span>
                      {entry.note ? (
                        <span className="truncate text-xs" style={{ color: 'var(--color-muted)' }}>
                          {entry.note}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="tnum shrink-0"
                      style={{
                        color: entry.amount < 0 ? 'var(--color-text)' : 'var(--color-gain)',
                      }}
                    >
                      <Money>{formatLedgerSpend(entry.amount)}</Money>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost shrink-0 disabled:opacity-60"
                      style={{ color: 'var(--color-loss)' }}
                      aria-label={rowDeleteLabel(entry, index, group.length)}
                      disabled={deletingIds.has(entry.id)}
                      onClick={() => void remove(entry)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
