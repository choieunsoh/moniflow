'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';

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
// ⚠ Never wrap a `position: sticky` element in this. The transform below is set even at rest
// (translateX(0px)), and a transformed ancestor becomes the containing block for sticky descendants
// — the stepper would scroll away instead of pinning. Every caller renders its stepper OUTSIDE.
const THRESHOLD = 44; // px of travel to commit
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
  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
    // A press that lands on an interactive child (category rows, edit buttons) belongs to that child
    // — capturing the pointer here would swallow its click and the tap would do nothing. Swiping
    // still works from charts, headings, and the padding around them.
    if (e.target instanceof Element && e.target.closest('a, button')) return;
    startX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>): void {
    if (startX.current === null) return;
    setDx(e.clientX - startX.current);
  }

  function onPointerUp(): void {
    if (startX.current === null) return;
    if (dx <= -THRESHOLD && nextHref !== null) router.push(nextHref);
    else if (dx >= THRESHOLD && prevHref !== null) router.push(prevHref);
    startX.current = null;
    setDragging(false);
    setDx(0);
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
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
