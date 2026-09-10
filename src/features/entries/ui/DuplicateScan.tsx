'use client';

import { useMemo, useState } from 'react';
import { withDb } from '@shared/db-effect';
import { getEntries } from '../queries';
import { deleteEntryAction, undoDeleteEntry } from '../actions';
import {
  findDuplicateGroups,
  DUPLICATE_FIELDS,
  DEFAULT_DUPLICATE_FIELDS,
  type DuplicateField,
} from '../duplicates';
import { toast } from '@shared/ui/toast';
import { formatLedgerSpend } from '@shared/money';
import { formatDayHeading } from '@shared/date';
import { Money } from '@shared/ui/Money';
import type { EntryRow } from '../schema';

// This label's whole job is telling apart several Delete buttons sitting in one group. Which fields
// a group actually shares is no longer something this function can assume — the caller picks the
// matching fields now, so any field (amount included) may be the one that varies within a group.
// Amount is folded in unconditionally rather than only when it's not one of the chosen fields: that
// keeps the label independent of `fields`, which this function never receives. Even that isn't
// enough for a genuine double-post, which matches on every field — the position within the group
// (`index + 1` of `groupSize`) is the one thing that's always guaranteed to differ.
function rowDeleteLabel(entry: EntryRow, index: number, groupSize: number): string {
  const note = entry.note?.trim();
  const base = `Delete ${entry.category} on ${formatDayHeading(entry.date)}, ${formatLedgerSpend(entry.amount)}, ${entry.account}`;
  const withNote = note ? `${base}, ${note}` : base;
  return `${withNote}, ${index + 1} of ${groupSize}`;
}

// Sentence-case, one word each: these read as a row of conditions, not as form fields.
const FIELD_LABELS = {
  date: 'Date',
  amount: 'Amount',
  category: 'Category',
  account: 'Account',
  note: 'Note',
} satisfies Record<DuplicateField, string>;

// On demand, never on mount: the scan reads the entire ledger (the same read the backup export
// performs) and opening this page is not a reason to pay for it. `null` groups means "not scanned",
// `[]` means "scanned and clean" — collapsing those two would make the empty state indistinguishable
// from the initial one, and the whole value of the surface is the sentence "No duplicates found".
export function DuplicateScan() {
  // The scanned rows, not the groups derived from them. Grouping is a pure function of these rows and
  // the chosen fields, so changing a condition re-groups in memory instead of re-reading ten thousand
  // rows over the worker RPC. It also removes a synchronisation duty: `groups` and the ledger drifting
  // apart after an undo is exactly the defect fixed in v1.25.0.
  const [rows, setRows] = useState<EntryRow[] | null>(null);
  // Not persisted. The scan is a rare, deliberate act and the default reproduces the rule the page
  // shipped with, which is the right thing to land on each visit.
  const [fields, setFields] = useState<readonly DuplicateField[]>(DEFAULT_DUPLICATE_FIELDS);
  const groups = useMemo(
    () => (rows === null ? null : findDuplicateGroups(rows, fields)),
    [rows, fields],
  );
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
      setRows(await getEntries(db));
    }).finally(() => setScanning(false));
  }

  // Delete, then offer the same Undo the Records swipe does (deleteEntryAction/undoDeleteEntry are
  // the same pairing, same snapshot). Drop the row from state and let the groups memo re-derive over
  // the rows already on screen minus the deleted id, rather than re-reading the whole ledger. This
  // path was unreachable while the component lived on /settings, whose ready gate unmounted it on
  // every delete; on /checkup nothing above it un-mounts, so this is the update the user actually sees.
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
            // A successful undo puts the row back in the ledger, but `rows` was already filtered
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
      // Drop the row and let the memo re-derive. Every other row's group membership is unaffected by
      // one deletion, so this is exactly what a second read would produce.
      setRows((current) =>
        current === null ? current : current.filter((row) => row.id !== entry.id),
      );
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
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <legend className="pb-1 text-sm font-semibold">Must match</legend>
        {DUPLICATE_FIELDS.map((field) => {
          const checked = fields.includes(field);
          const isLastChecked = checked && fields.length === 1;
          return (
            <label
              key={field}
              className="tap flex items-center gap-1.5 text-sm"
              title={isLastChecked ? 'At least one condition must match' : undefined}
            >
              <input
                type="checkbox"
                checked={checked}
                // The last checked box can't be cleared: with nothing to key on every row shares a key
                // and the whole ledger would read as one duplicate group.
                disabled={isLastChecked}
                onChange={(e) => {
                  const next = e.currentTarget.checked;
                  // Rebuild from DUPLICATE_FIELDS so the list stays in its canonical order however it
                  // was toggled — the key is built in this order, and a stable order keeps it readable.
                  setFields((current) =>
                    DUPLICATE_FIELDS.filter((f) => (f === field ? next : current.includes(f))),
                  );
                }}
              />
              {FIELD_LABELS[field]}
            </label>
          );
        })}
      </fieldset>
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
              // findDuplicateGroups partitions rows into buckets, so no two groups share a row, and
              // each group is sorted id-ascending — so no two groups share a minimum id either. That
              // makes the first row's id unique per group without building an O(n) string out of
              // every id in it, which matters once one bucket (e.g. every row with no note) holds
              // most of the ledger.
              key={group[0].id}
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
