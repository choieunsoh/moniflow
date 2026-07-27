'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { PointerEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { beginsDrag, commitHref, suppressesClick } from '../swipe';

// Horizontal swipe over a page's content to step its axis (Monefy-style): swipe left → next, right
// → previous. The content follows the finger (damped) as the affordance, then springs back if the
// gesture doesn't pass the threshold. `touch-action: pan-y` keeps vertical scrolling native — we
// only claim horizontal.
//
// It takes HREFS, not a key to step. The page already computes where its stepper's arrows point and
// where they stop, so handing the same two strings here keeps gesture and arrows agreeing by
// construction — deriving the boundary twice is how you get a swipe that navigates somewhere the
// arrow says is unreachable. A null href is a closed direction: the drag springs back.
//
// TAPS AND SWIPES SHARE THE SAME SURFACE. This used to refuse to start on any link or button,
// because capturing the pointer swallows the click underneath — which made /month's category and
// year lists, the rows a thumb actually lands on, completely un-swipeable. Instead the press is now
// left alone until it has clearly travelled sideways (beginsDrag): under that it stays a tap and the
// link gets its click; past it we capture, and the click that follows is swallowed on the way down
// so a drag can never also activate whatever it started on.
//
// ⚠ Never wrap a `position: sticky` element in this. The transform below is set even at rest
// (translateX(0px)), and a transformed ancestor becomes the containing block for sticky descendants
// — the stepper would scroll away instead of pinning. Every caller renders its stepper OUTSIDE.
const DAMP = 0.5; // how far the content trails the pointer before commit

export function SwipeNav({
  prevHref,
  nextHref,
  className = '',
  children,
}: {
  prevHref: string | null;
  nextHref: string | null;
  // The wrapper becomes a flex item in PageContainer's column, so a caller that swipes MORE than one
  // panel has to restate the column here (`-mt-3 flex flex-col gap-6`) or its panels lose the page's
  // rhythm and stack flush.
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  // Refs, not state: the commit decision must read the distance the pointer ACTUALLY reached, and a
  // pointerup landing in the same frame as the last pointermove would otherwise close over a stale
  // render. `dragged` also has to outlive pointerup — the click it suppresses arrives after.
  const dxRef = useRef(0);
  const dragged = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    start.current = { x: e.clientX, y: e.clientY };
    dxRef.current = 0;
    // Cleared here rather than after suppressing a click, because a drag over empty space produces
    // no click at all — left set, it would swallow the NEXT genuine tap.
    dragged.current = false;
    // Deliberately no capture and no state change yet: until this press proves itself a drag it is
    // a tap, and the child underneath must be free to handle it.
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (start.current === null) return;
    const nextDx = e.clientX - start.current.x;
    if (!dragged.current) {
      if (!beginsDrag(nextDx, e.clientY - start.current.y)) return;
      dragged.current = true;
      setDragging(true);
      // MOUSE ONLY, and this is the whole reason a tap could vanish. Capturing retargets the pointer
      // to this div, so pointerdown lands on the row and pointerup lands here — different elements,
      // so the browser never synthesises a click at all. Not suppressed: never generated. Every press
      // that passed the slop was therefore dead on touch no matter what the click handler decided.
      // Touch already gives implicit capture to the element that received pointerdown (the row) and
      // those events bubble here, so the drag tracks a finger perfectly well without it; a mouse gets
      // no such help and still needs the capture to keep receiving moves outside the div.
      if (e.pointerType === 'mouse') e.currentTarget.setPointerCapture(e.pointerId);
    }
    dxRef.current = nextDx;
    setDx(nextDx);
  }

  function onPointerUp(): void {
    if (start.current === null) return;
    const href = dragged.current ? commitHref(dxRef.current, prevHref, nextHref) : null;
    start.current = null;
    setDragging(false);
    setDx(0);
    if (href !== null) router.push(href);
  }

  // Capture phase, so a drag that started on a link is stopped before the link's own onClick runs.
  // preventDefault covers the anchor's native navigation, stopPropagation the React handler.
  //
  // Gated on the distance actually travelled, not merely on having become a drag. A press that
  // passed the slop but stopped short of COMMIT springs back WITHOUT navigating, so swallowing its
  // click too meant the row did nothing at all — no movement, no navigation, no feedback. That dead
  // zone is what made tapping a month row feel like the app had ignored you. dxRef still holds the
  // final travel here: it is cleared on the next pointerdown, not on pointerup.
  function onClickCapture(e: ReactMouseEvent<HTMLDivElement>): void {
    if (!dragged.current) return;
    dragged.current = false;
    if (!suppressesClick(dxRef.current)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      // The browser takes the gesture over for a vertical pan (touch-action: pan-y) and cancels
      // ours. Route it through the same teardown so a scroll never leaves the content offset.
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      // A mouse drag over the content can otherwise start the browser's native image/text drag and
      // swallow the gesture — kill it. select-none stops text selection while dragging.
      onDragStart={(e) => e.preventDefault()}
      draggable={false}
      className={`cursor-grab touch-pan-y select-none active:cursor-grabbing ${className}`}
      style={{
        transform: `translateX(${dragging ? dx * DAMP : 0}px)`,
        transition: dragging ? 'none' : 'transform var(--dur) var(--ease-out)',
      }}
    >
      {children}
    </div>
  );
}
