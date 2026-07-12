'use client';

import { useEffect, useRef } from 'react';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

// Reusable yes/no confirm on the native <dialog> — same pattern as MoreSheet (showModal gives
// focus-trap, Esc, ::backdrop, top-layer stacking for free). Deliberately minimal props: no
// variant/icon/size config-explosion. `destructive` reddens the confirm button (--color-loss).
//
// Controlled like MoreSheet: onClose may fire twice per interaction — once synchronously from a
// click/backdrop handler, then again from the native <dialog> 'close' event dialog.close() dispatches.
// Pass an idempotent handler (e.g. () => setOpen(false)).
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop click (target is the dialog itself)
      }}
    >
      <div className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {body}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={destructive ? 'btn' : 'btn btn-primary'}
            style={
              destructive
                ? { background: 'var(--color-loss)', color: 'var(--color-on-accent)' }
                : undefined
            }
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
