'use client';

import { useRef, useState, type ReactNode } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { SortableGrid } from './SortableGrid';

// A "Reorder" header button that opens a bottom sheet holding a drag-sortable 3-col tile grid. The
// management pages (categories, accounts) are server components, so the trigger + dialog live here as
// one client island; the feature wrapper supplies the icon (renderTile) and the persist action
// (onReorder). Each drop persists immediately (SortableGrid is optimistic) — "Done" just closes.
// The grid only mounts while the sheet is open, so dnd-kit never runs (or SSRs) until it's needed.
export function ReorderSheet<T>({
  id,
  title,
  items,
  getId,
  onReorder,
  renderTile,
}: {
  id: string; // stable, unique per grid — keeps dnd-kit's aria ids deterministic (see SortableGrid)
  title: string;
  items: T[];
  getId: (item: T) => string;
  onReorder: (ordered: T[]) => void;
  renderTile: (item: T) => ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          ref.current?.showModal();
        }}
        className="tap shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium active:opacity-70"
        style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
      >
        <ArrowUpDown size={16} aria-hidden />
        Reorder
      </button>

      <dialog
        ref={ref}
        className="more-sheet"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) close();
        }}
      >
        {open && (
          <div className="flex flex-col gap-3 p-4">
            <span
              aria-hidden
              className="mx-auto h-1 w-10 rounded-full"
              style={{ background: 'var(--color-border-strong)' }}
            />
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{title}</h2>
              <button
                type="button"
                onClick={close}
                className="tap text-sm font-medium underline"
                style={{ color: 'var(--color-text)' }}
              >
                Done
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Drag a tile to change the order.
            </p>
            {/* Horizontal containment is handled by SortableGrid's restrictToFirstScrollableAncestor
                modifier (this element is that ancestor). overflow-x-hidden is a cheap backstop for any
                sub-pixel spill; overflow-y-auto scrolls the long grid. */}
            <div className="max-h-[60vh] overflow-x-hidden overflow-y-auto">
              <SortableGrid
                id={id}
                items={items}
                getId={getId}
                onReorder={onReorder}
                className="grid grid-cols-3 gap-2"
              >
                {(item, tile) => (
                  <div
                    ref={tile.setNodeRef}
                    {...tile.attributes}
                    {...tile.listeners}
                    className="panel flex cursor-grab flex-col items-center gap-1 px-2 py-3 text-center active:cursor-grabbing"
                    style={tile.style}
                  >
                    {renderTile(item)}
                  </div>
                )}
              </SortableGrid>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
