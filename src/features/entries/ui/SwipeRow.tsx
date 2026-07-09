'use client';

import Link from 'next/link';
import type { PointerEvent } from 'react';
import { useRef, useState } from 'react';
import { formatSignedBaht } from '@shared/money';
import { formatDay } from '@shared/date';
import { deleteEntryAction } from '../actions';
import type { Entry } from '../schema';
import { resolveSwipe, type SwipeSide } from '../swipe';

// Width of each action panel revealed behind the row.
const ACTION_W = 88;
// Movement (px) past which a gesture counts as a drag rather than a tap.
const DRAG_SLOP = 6;

// A swipe-to-reveal ledger row. Drag the row right to reveal Edit (accent, left) or left to reveal
// Delete (red, right); release past half a panel to rest it open, otherwise it snaps back. Tapping an
// open row closes it. `touch-action: pan-y` keeps vertical scrolling native — we only own horizontal.
// Delete/Edit are real DOM controls (a form button + a link), so they stay in the a11y tree.
export function SwipeRow({ entry }: { entry: Entry }) {
  const [side, setSide] = useState<SwipeSide>(0); // resting position
  const [offset, setOffset] = useState(0); // live drag offset while dragging
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; base: number; moved: boolean } | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    gesture.current = { x: e.clientX, base: side * ACTION_W, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const delta = e.clientX - g.x;
    if (Math.abs(delta) > DRAG_SLOP) g.moved = true;
    setOffset(Math.max(-ACTION_W, Math.min(ACTION_W, g.base + delta)));
  }

  function onPointerUp() {
    const g = gesture.current;
    if (!g) return;
    // A tap (no real movement) on an open row closes it; otherwise snap to the resolved side.
    const next = g.moved ? resolveSwipe(offset, ACTION_W) : 0;
    setSide(next);
    setOffset(next * ACTION_W);
    setDragging(false);
    gesture.current = null;
  }

  const detail = entry.note && entry.note.trim() ? entry.note : entry.account;
  const translate = dragging ? offset : side * ACTION_W;

  return (
    <li
      className="relative overflow-hidden border-t"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {/* Edit — revealed on a right swipe (row slides right). */}
      <Link
        href={`/entries/${entry.id}/edit`}
        aria-label={`Edit ${entry.category}`}
        onClick={() => setSide(0)}
        className="absolute inset-y-0 left-0 flex items-center justify-center text-sm font-semibold"
        style={{
          width: ACTION_W,
          background: 'var(--color-accent)',
          color: 'var(--color-on-accent)',
        }}
      >
        Edit
      </Link>

      {/* Delete — revealed on a left swipe (row slides left). */}
      <form
        action={deleteEntryAction}
        className="absolute inset-y-0 right-0"
        style={{ width: ACTION_W }}
      >
        <input type="hidden" name="id" value={entry.id} />
        <button
          type="submit"
          aria-label={`Delete ${entry.category}`}
          className="flex h-full w-full items-center justify-center text-sm font-semibold"
          style={{ background: 'var(--color-loss)', color: 'var(--color-on-accent)' }}
        >
          Delete
        </button>
      </form>

      {/* Foreground — the entry; opaque so it hides the actions when closed. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex touch-pan-y flex-col gap-2 px-4 py-3 select-none"
        style={{
          background: 'var(--color-surface)',
          transform: `translateX(${translate}px)`,
          transition: dragging ? 'none' : 'transform var(--dur) var(--ease-out)',
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="chip">{entry.category}</span>
          <span
            className="tnum font-medium whitespace-nowrap"
            style={{ color: entry.amount < 0 ? 'var(--color-loss)' : 'var(--color-gain)' }}
          >
            {formatSignedBaht(entry.amount)}
          </span>
        </div>
        <div className="tnum truncate text-sm" style={{ color: 'var(--color-muted)' }}>
          {formatDay(entry.date)} · {detail}
        </div>
      </div>
    </li>
  );
}
