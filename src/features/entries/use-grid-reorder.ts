'use client';

import { useCallback, useRef, useState } from 'react';

const LONG_PRESS_MS = 400;
const CANCEL_DIST = 10; // px of pre-activation movement that means "scroll/tap", not "drag"

// Move arr[from] to index `to`, returning a new array (or the same reference for a no-op). Pure.
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// The tile index under a screen point, or null. The lifted tile carries pointer-events:none so this
// sees the tile beneath it; closest() climbs from the icon/label child to the tile button.
function indexAtPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y);
  const tile = el?.closest('[data-reorder-index]');
  const raw = tile?.getAttribute('data-reorder-index');
  return raw === null || raw === undefined ? null : Number(raw);
}

// The tile only exposes what the hook actually calls on it — pointer capture. Both a real DOM
// element (Element has these methods) and a test double satisfy it, so no cast is ever needed.
type CaptureTarget = {
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
};

// The subset of a pointer event the handlers read. A React PointerEvent is assignable to this — its
// currentTarget is an Element, which has the capture methods — and so is a plain test object. Typing
// the handlers to this (not React's PointerEvent) is what lets the hook be unit-tested without `as`.
type DragPointer = {
  pointerId: number;
  clientX: number;
  clientY: number;
  currentTarget: CaptureTarget;
};

type Session<T> = {
  pointerId: number;
  node: CaptureTarget;
  startX: number;
  startY: number;
  curIndex: number;
  order: T[];
  activated: boolean;
  moved: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

type TileHandlers = {
  'data-reorder-index': number;
  onPointerDown: (e: DragPointer) => void;
  onPointerMove: (e: DragPointer) => void;
  onPointerUp: (e: DragPointer) => void;
  onPointerCancel: (e: DragPointer) => void;
};

export type GridReorder<T> = {
  items: T[]; // the order to render (optimistic while dragging, server order otherwise)
  dragIndex: number | null; // the lifted tile's current slot, for styling
  tileProps: (index: number) => TileHandlers;
  consumeDragClick: () => boolean; // tile onClick calls this; true = a drag happened, cancel the tap
};

// Long-press drag-reorder for a tile grid, no dependency. A plain press/release stays a tap; holding
// ~400ms lifts the tile, then pointer moves reorder via elementFromPoint. On drop the new order is
// handed to onReorder. Pointer capture (taken only once the long press fires) routes the move/up
// events to the origin node, so a drag that wanders off the tile still tracks. See
// docs/superpowers/specs/2026-07-12-keypad-reorder-design.md.
export function useGridReorder<T extends { name: string }>(
  items: T[],
  onReorder: (ordered: T[]) => void,
): GridReorder<T> {
  const [override, setOverride] = useState<T[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const shown = override ?? items;

  // Once the server revalidates with the persisted order, drop the optimistic copy. Reset during
  // render (React's "adjusting state when a prop changes" pattern) rather than in an effect, so the
  // stale optimistic order never paints and react-hooks/set-state-in-effect stays satisfied.
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setOverride(null);
  }

  const session = useRef<Session<T> | null>(null);
  const draggedClick = useRef(false);

  const end = useCallback(
    (s: Session<T>) => {
      if (s.timer) clearTimeout(s.timer);
      try {
        s.node.releasePointerCapture(s.pointerId);
      } catch {
        // not captured (never activated, or unsupported) — nothing to release
      }
      session.current = null;
      setDragIndex(null);
      if (s.activated) {
        draggedClick.current = true; // eat the click the release synthesizes on touch
        if (s.moved) onReorder(s.order);
      }
    },
    [onReorder],
  );

  const onPointerDown = useCallback(
    (index: number, e: DragPointer) => {
      if (session.current) return;
      const node = e.currentTarget;
      const pointerId = e.pointerId;
      const s: Session<T> = {
        pointerId,
        node,
        startX: e.clientX,
        startY: e.clientY,
        curIndex: index,
        order: shown,
        activated: false,
        moved: false,
        timer: null,
      };
      s.timer = setTimeout(() => {
        s.activated = true;
        s.timer = null;
        try {
          node.setPointerCapture(pointerId);
        } catch {
          // unsupported (e.g. jsdom) — drag still works via elementFromPoint
        }
        setDragIndex(index);
        setOverride(s.order);
      }, LONG_PRESS_MS);
      session.current = s;
    },
    [shown],
  );

  const onPointerMove = useCallback((e: DragPointer) => {
    const s = session.current;
    if (!s || s.pointerId !== e.pointerId) return;
    if (!s.activated) {
      // Pre-activation: a real move means the user is scrolling/flicking, not holding to drag.
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > CANCEL_DIST) {
        if (s.timer) clearTimeout(s.timer);
        session.current = null;
      }
      return;
    }
    const over = indexAtPoint(e.clientX, e.clientY);
    if (over === null || over === s.curIndex) return;
    s.order = moveItem(s.order, s.curIndex, over);
    s.curIndex = over;
    s.moved = true;
    setOverride(s.order);
    setDragIndex(over);
  }, []);

  const onPointerUp = useCallback(
    (e: DragPointer) => {
      const s = session.current;
      if (!s || s.pointerId !== e.pointerId) return;
      end(s);
    },
    [end],
  );

  const tileProps = useCallback(
    (index: number): TileHandlers => ({
      'data-reorder-index': index,
      onPointerDown: (e) => onPointerDown(index, e),
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    }),
    [onPointerDown, onPointerMove, onPointerUp],
  );

  const consumeDragClick = useCallback(() => {
    if (draggedClick.current) {
      draggedClick.current = false;
      return true;
    }
    return false;
  }, []);

  return { items: shown, dragIndex, tileProps, consumeDragClick };
}
