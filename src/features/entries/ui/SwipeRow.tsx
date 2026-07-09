'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { PointerEvent } from 'react';
import { useRef, useState } from 'react';
import { formatBaht, formatSignedBaht } from '@shared/money';
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
export function SwipeRow({ entry, emoji }: { entry: Entry; emoji: string }) {
  const [side, setSide] = useState<SwipeSide>(0); // resting position
  const [offset, setOffset] = useState(0); // live drag offset while dragging
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const params = useSearchParams();
  const categoryActive = params.get('category') === entry.category;
  const accountActive = params.get('account') === entry.account;

  // Tapping a chip toggles that filter: set it, or clear it if it's already the active one. Other
  // params (cycle) are preserved.
  function toggleHref(key: string, value: string, active: boolean): string {
    const next = new URLSearchParams(params.toString());
    if (active) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    return qs ? `/records?${qs}` : '/records';
  }
  // Pressing a chip filters instead of starting a swipe — keep the drag from claiming the pointer.
  const stopDrag = (e: PointerEvent<HTMLElement>) => e.stopPropagation();

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

  const note = entry.note?.trim();
  const translate = dragging ? offset : side * ACTION_W;

  return (
    <li className="relative overflow-hidden">
      {/* Edit — revealed on a right swipe (row slides right). */}
      <Link
        href={`/entries/${entry.id}/edit`}
        aria-label={`Edit ${entry.category}`}
        onClick={() => setSide(0)}
        className="absolute inset-y-0 left-0 flex items-center justify-center"
        style={{
          width: ACTION_W,
          background: 'var(--color-accent)',
          color: 'var(--color-on-accent)',
        }}
      >
        <PencilIcon />
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
          className="flex h-full w-full items-center justify-center"
          style={{ background: 'var(--color-loss)', color: 'var(--color-on-accent)' }}
        >
          <TrashIcon />
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
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="shrink-0 text-base leading-none">
              {emoji}
            </span>
            {/* Tap a chip to filter by it; tap the active (accent) one to clear. Swipe from the row
                body still works. */}
            <Link
              href={toggleHref('category', entry.category, categoryActive)}
              onPointerDown={stopDrag}
              aria-label={
                categoryActive ? `Clear ${entry.category} filter` : `Filter by ${entry.category}`
              }
              className="chip shrink-0 transition-opacity active:opacity-70"
              style={
                categoryActive
                  ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent-text)' }
                  : undefined
              }
            >
              {entry.category}
            </Link>
            {/* Account as a lighter outline badge so it reads as secondary to the category. */}
            <Link
              href={toggleHref('account', entry.account, accountActive)}
              onPointerDown={stopDrag}
              aria-label={
                accountActive ? `Clear ${entry.account} filter` : `Filter by ${entry.account}`
              }
              className="shrink-0 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap transition-opacity active:opacity-70"
              style={{
                borderColor: accountActive ? 'var(--color-accent-text)' : 'var(--color-border)',
                color: accountActive ? 'var(--color-accent-text)' : 'var(--color-faint)',
              }}
            >
              {entry.account}
            </Link>
          </span>
          <span
            className="tnum shrink-0 font-medium whitespace-nowrap"
            style={{ color: entry.amount < 0 ? 'var(--color-loss)' : 'var(--color-gain)' }}
          >
            {/* Expense-only: show expenses as magnitudes (the minus is redundant on every row); only
                the rare income row keeps its signed +green so the exception stays honest. */}
            {entry.amount < 0 ? formatBaht(-entry.amount) : formatSignedBaht(entry.amount)}
          </span>
        </div>
        {note ? (
          <div className="truncate text-sm" style={{ color: 'var(--color-muted)' }}>
            {note}
          </div>
        ) : null}
      </div>
    </li>
  );
}

// Action icons (stroke=currentColor → inherit the panel's on-accent white). Simple, familiar glyphs.
function PencilIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M10.5 3 13 5.5 M3 13v-2.2l7.3-7.3 2.2 2.2L5.2 13H3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 4.5h10 M6 4.5V3.2h4v1.3 M4.7 4.5 5.2 13h5.6l.5-8.5 M6.6 6.8v3.8 M9.4 6.8v3.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
