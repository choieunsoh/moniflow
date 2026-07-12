'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { mergeAndRemoveAccount, undoMergeAndRemoveAccount } from '../actions';
import { toast } from '@shared/ui/toast';

// A USED account can't be deleted (its entries would orphan) — instead "merge & remove": reassign its
// entries into a chosen target account, then drop the source. A native <dialog> (own chrome, its own
// <select>) picks the target; on confirm we call the typed action, get an undo snapshot back, and fire
// an Undo toast (toast.action, from concern #2). This is NOT the yes/no ConfirmDialog — it's a picker.
export function AccountMergeButton({ account, others }: { account: string; others: string[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState(others[0] ?? '');
  const [busy, setBusy] = useState(false);

  async function confirm(): Promise<void> {
    if (!target || busy) return;
    setBusy(true);
    try {
      const snap = await mergeAndRemoveAccount(account, target);
      ref.current?.close();
      toast.action(`Merged “${account}” into “${target}”`, {
        label: 'Undo',
        onClick: () => {
          undoMergeAndRemoveAccount(snap).catch(() => toast.error('Failed to undo — try again'));
        },
      });
    } catch {
      toast.error('Failed to merge account — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        disabled={others.length === 0}
        aria-label={`Remove ${account}`}
        title={
          others.length === 0
            ? `Can't remove ${account} — it's the only account`
            : `Remove ${account} (merge its entries into another account)`
        }
        className="tap shrink-0 rounded-[var(--radius-sm)] px-2 transition-colors active:scale-95 disabled:pointer-events-none disabled:opacity-40"
        style={{ color: 'var(--color-faint)' }}
      >
        <Trash2 size={18} aria-hidden />
      </button>

      <dialog
        ref={ref}
        className="emoji-dialog"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Remove “{account}”</h2>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            This account has entries. Move them into another account, then remove it. You can undo.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Move entries to
            <select
              value={target}
              onChange={(e) => setTarget(e.currentTarget.value)}
              className="min-h-11 rounded-[var(--radius-sm)] border px-3 text-base"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
            >
              {others.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="btn"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void confirm();
              }}
              disabled={!target || busy}
              className="btn disabled:pointer-events-none disabled:opacity-40"
              style={{ background: 'var(--color-loss)', color: 'var(--color-on-accent)' }}
            >
              Merge &amp; remove
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
