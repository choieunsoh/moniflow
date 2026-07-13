'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PointerEvent } from 'react';
import { useRef, useState } from 'react';
import { formatBaht, formatSignedBaht } from '@shared/money';
import { formatForeign } from '../trips';
import { deleteEntryAction } from '../actions';
import type { EntryRow } from '../schema';
import { resolveSwipe, type SwipeSide } from '../swipe';
import { CategoryIconButton } from '@features/categories/ui/CategoryPicker';
import type { IconSet } from '@features/settings/queries';

// Width of each action panel revealed behind the row.
const ACTION_W = 88;
// Movement (px) past which a gesture counts as a drag rather than a tap.
const DRAG_SLOP = 6;

// A ledger row. Tap it to edit — a closed row opens the editor, an open row just closes. Drag it left
// to reveal Delete (red, right); release past half the panel to rest it open, else it snaps back. A
// vertical drag stays a native scroll and never edits. `touch-action: pan-y` keeps scrolling native.
// Delete/Edit are real DOM controls (a form button + a link) behind the row, so both stay in the a11y
// tree for keyboard/AT even though editing is now a tap.
export function SwipeRow({
  entry,
  emoji,
  iconSet,
  hue,
  dateLabel,
  showForeign = false,
}: {
  entry: EntryRow;
  emoji: string;
  iconSet: IconSet;
  hue?: number;
  // Set in the by-category view: the row leads with this date instead of the (redundant) category
  // marker + chip, since every row under the section already shares the header's category.
  dateLabel?: string;
  // Trip view: lead the amount with the foreign original (¥1,200) and keep THB as the muted line.
  showForeign?: boolean;
}) {
  const [side, setSide] = useState<SwipeSide>(0); // resting position
  const [offset, setOffset] = useState(0); // live drag offset while dragging
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    base: number;
    movedX: boolean;
    movedY: boolean;
  } | null>(null);
  const router = useRouter();
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
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      base: side * ACTION_W,
      movedX: false,
      movedY: false,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > DRAG_SLOP) g.movedX = true;
    if (Math.abs(dy) > DRAG_SLOP) g.movedY = true;
    // Left-only drag: Delete lives on the right, revealed by dragging left. Editing is a plain tap now,
    // so a rightward drag no longer reveals an edit panel — clamp the offset to [-ACTION_W, 0].
    setOffset(Math.max(-ACTION_W, Math.min(0, g.base + dx)));
  }

  function onPointerUp() {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    setDragging(false);
    if (g.movedX) {
      // A horizontal drag — snap the Delete panel open or closed.
      const next = resolveSwipe(offset, ACTION_W);
      setSide(next);
      setOffset(next * ACTION_W);
      return;
    }
    if (g.movedY) {
      // A vertical move is a scroll, never a tap — settle back to the resting side, do nothing.
      setOffset(side * ACTION_W);
      return;
    }
    // A clean tap: close an open (Delete-revealed) row, or open the editor for a closed one.
    if (side !== 0) {
      setSide(0);
      setOffset(0);
      return;
    }
    router.push(`/entries/${entry.id}/edit`);
  }

  function onPointerCancel() {
    // The browser took the gesture over (native scroll) — never treat it as a tap; settle in place.
    gesture.current = null;
    setDragging(false);
    setOffset(side * ACTION_W);
  }

  const note = entry.note?.trim();
  const translate = dragging ? offset : side * ACTION_W;
  // In the trip view, surface the foreign original (magnitude) as the headline figure.
  const foreign =
    showForeign && entry.currency && entry.currency !== 'THB' && entry.originalAmount != null
      ? { amount: Math.abs(entry.originalAmount), currency: entry.currency }
      : null;
  const baht = entry.amount < 0 ? formatBaht(-entry.amount) : formatSignedBaht(entry.amount);
  const amountColor = entry.amount < 0 ? 'var(--color-loss)' : 'var(--color-gain)';

  return (
    <li className="relative overflow-hidden">
      {/* Edit — tapping the row opens it (pointer); this control stays in the DOM behind the row so
          keyboard/AT users keep a real, focusable edit affordance. No longer revealed by a swipe. */}
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
        onPointerCancel={onPointerCancel}
        className="relative flex cursor-pointer touch-pan-y flex-col gap-2 bg-[var(--color-surface)] px-4 py-3 select-none hover:bg-[var(--color-surface-2)]"
        style={{
          transform: `translateX(${translate}px)`,
          // background-color in the transition so the hover lift fades in; dropped while dragging.
          transition: dragging
            ? 'none'
            : 'transform var(--dur) var(--ease-out), background-color var(--dur) var(--ease-out)',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {dateLabel ? (
              // By-category view: the category is the section header, so lead with the date instead.
              <span className="shrink-0 text-sm font-medium">{dateLabel}</span>
            ) : (
              <>
                {/* Tap the marker to edit this category's icon + background via the page's shared
                    picker dialog (one per page, not one per row). stopDrag keeps the press from
                    starting a swipe. */}
                <span onPointerDown={stopDrag}>
                  <CategoryIconButton
                    category={entry.category}
                    emoji={emoji}
                    iconSet={iconSet}
                    hue={hue}
                  />
                </span>
                {/* Tap a chip to filter by it; tap the active (accent) one to clear. Swipe from the
                    row body still works. */}
                <Link
                  href={toggleHref('category', entry.category, categoryActive)}
                  onPointerDown={stopDrag}
                  aria-label={
                    categoryActive
                      ? `Clear ${entry.category} filter`
                      : `Filter by ${entry.category}`
                  }
                  className="chip shrink-0 transition-opacity active:opacity-70"
                  style={
                    categoryActive
                      ? {
                          background: 'var(--color-accent-soft)',
                          color: 'var(--color-accent-text)',
                        }
                      : undefined
                  }
                >
                  {entry.category}
                </Link>
              </>
            )}
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
          {/* Expense-only: show expenses as magnitudes (the minus is redundant on every row); only
              the rare income row keeps its signed +green so the exception stays honest. In the trip
              view the foreign original leads and THB drops to a muted second line. */}
          {foreign ? (
            <span className="flex shrink-0 flex-col items-end">
              <span className="tnum font-medium whitespace-nowrap" style={{ color: amountColor }}>
                {formatForeign(foreign.amount, foreign.currency)}
              </span>
              <span
                className="tnum text-xs whitespace-nowrap"
                style={{ color: 'var(--color-muted)' }}
              >
                {baht}
              </span>
            </span>
          ) : (
            <span
              className="tnum shrink-0 font-medium whitespace-nowrap"
              style={{ color: amountColor }}
            >
              {baht}
            </span>
          )}
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
