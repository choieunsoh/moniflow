'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { stepKey } from '../cycle';

// Horizontal swipe over the home chart to change cycle (Monefy-style): swipe left → next cycle,
// right → prev. The content follows the finger (damped) as the affordance, then springs back if the
// gesture doesn't pass the threshold. `touch-action: pan-y` keeps vertical scrolling native — we
// only claim horizontal. Navigation preserves the other params (e.g. ?view=) and just swaps ?cycle=.
const THRESHOLD = 44; // px of travel to commit a cycle change
const DAMP = 0.5; // how far the content trails the pointer before commit

export function CycleSwipe({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const startX = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);

  function go(delta: -1 | 1): void {
    const next = new URLSearchParams(params.toString());
    next.set('cycle', stepKey(activeKey, delta));
    router.push(`${pathname}?${next.toString()}`);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>): void {
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
    if (dx <= -THRESHOLD)
      go(1); // swiped left → next cycle
    else if (dx >= THRESHOLD) go(-1); // swiped right → previous cycle
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
      className="cursor-grab touch-pan-y select-none active:cursor-grabbing"
      style={{
        transform: `translateX(${dragging ? dx * DAMP : 0}px)`,
        transition: dragging ? 'none' : 'transform var(--dur) var(--ease-out)',
      }}
    >
      {children}
    </div>
  );
}
