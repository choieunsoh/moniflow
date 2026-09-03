'use client';

import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { renameTrip } from '../actions';
import { toast } from '@shared/ui/toast';

// The corner pencil on a trip card: opens a small native <dialog> to name the trip (e.g. "Hokkaido
// 2024"). Sits as a sibling of the card's <Link> — not nested inside it — so tapping the pencil never
// triggers the link's navigation to the trip's records. Submitting calls the typed renameTrip action
// directly (same shape as the account actions), then closes and confirms with a toast. Clearing the
// field removes the name.
export function TripRename({
  currency,
  start,
  title,
}: {
  currency: string;
  start: string;
  title?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(title ?? '');
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await renameTrip(currency, start, value);
      ref.current?.close();
      const named = value.trim();
      toast(named ? `Trip named “${named}”` : 'Trip name cleared');
    } catch {
      toast.error('Failed to rename trip — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(title ?? ''); // resync in case the card re-rendered with a new name
          ref.current?.showModal();
        }}
        aria-label={title ? `Rename ${title}` : `Name this ${currency} trip`}
        className="tap absolute top-2.5 right-2.5 z-10 rounded-[var(--radius-sm)] px-2 transition-colors active:scale-95"
        style={{ color: 'var(--color-faint)' }}
      >
        <Pencil size={16} aria-hidden />
      </button>

      <dialog
        ref={ref}
        className="confirm-dialog"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2 className="text-sm font-semibold">Name this trip</h2>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {currency} · gives this trip a memorable name, e.g. “Hokkaido 2024”.
          </p>
          <input
            name="title"
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            autoFocus
            maxLength={60}
            placeholder="e.g. Japan 2025"
            className="min-h-11 rounded-[var(--radius-sm)] border px-3 text-base"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
          />
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
              type="submit"
              disabled={busy}
              className="btn disabled:pointer-events-none disabled:opacity-40"
              style={{ background: 'var(--color-action)', color: 'var(--color-on-action)' }}
            >
              Save
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
