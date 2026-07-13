'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import { reorderByIds } from '../reorder';

// What each tile receives: the dnd-kit sortable bag (spread `attributes`/`listeners`, wire `setNodeRef`)
// plus a merged `style` (drag transform + lifted look) and `justDragged` — call it from the tile's
// onClick to cancel the tap that a drop synthesizes (so a drag never submits/selects).
type SortableTile = ReturnType<typeof useSortable> & {
  style: CSSProperties;
  justDragged: () => boolean;
};

function SortableItem({
  id,
  justDragged,
  children,
}: {
  id: string;
  justDragged: () => boolean;
  children: (tile: SortableTile) => ReactNode;
}) {
  const sortable = useSortable({ id });
  const base = CSS.Transform.toString(sortable.transform);
  const style: CSSProperties = {
    transform: sortable.isDragging && base ? `${base} scale(1.06)` : base,
    transition: sortable.transition,
    ...(sortable.isDragging ? { opacity: 0.9, zIndex: 10 } : {}),
    touchAction: 'manipulation',
  };
  return children({ ...sortable, style, justDragged });
}

// Long-press (touch) / click-drag (mouse) reorder for a tile grid, backed by dnd-kit. The 400ms
// touch delay + 10px tolerance preserve the old behavior: a hold lifts a tile, a move scrolls. The
// dragged item and its siblings animate (dnd-kit FLIP), which the hand-rolled version could not do.
// Optimistic: the dropped order shows immediately and resets once the server revalidates `items`.
export function SortableGrid<T>({
  id,
  items,
  getId,
  onReorder,
  className,
  children,
}: {
  // Stable, unique per grid: dnd-kit derives its aria-describedby/live-region ids from a module
  // counter that drifts between server and client render, so without an explicit id every DndContext
  // hydration-mismatches. A fixed string makes those ids deterministic across SSR and hydration.
  id: string;
  items: T[];
  getId: (item: T) => string;
  onReorder: (ordered: T[]) => void;
  className?: string;
  children: (item: T, tile: SortableTile) => ReactNode;
}) {
  const [override, setOverride] = useState<T[] | null>(null);
  const shown = override ?? items;

  // Drop the optimistic order once the server revalidates with the persisted one (reset during render
  // — React's "adjust state on prop change" pattern — so the stale order never paints).
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setOverride(null);
  }

  // True from the moment a drag activates until a tile's onClick consumes it, so the click a drop
  // synthesizes never submits/selects. Reset on every fresh press so a stray flag can't eat a later tap.
  const dragged = useRef(false);
  const justDragged = () => {
    if (dragged.current) {
      dragged.current = false;
      return true;
    }
    return false;
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = shown.map(getId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const next = reorderByIds(shown, getId, String(active.id), String(over.id));
    if (next === shown) return;
    setOverride(next);
    onReorder(next);
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      // Confine the dragged tile to the grid's rect: without this a tile dragged past the right edge
      // overflows, and dnd-kit auto-scrolls that overflow sideways — spawning a horizontal scrollbar
      // and even mis-dropping. The grid's width == the scroll container's and it never scrolls
      // horizontally, so clamping to it means zero horizontal overflow. CSS can't clamp dnd-kit's
      // inline transform; this modifier can.
      modifiers={[restrictToParentElement]}
      onDragStart={() => {
        dragged.current = true;
      }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className={className}
          onPointerDownCapture={() => {
            dragged.current = false; // a new press starts clean; a drag re-arms it via onDragStart
          }}
        >
          {shown.map((item) => (
            <SortableItem key={getId(item)} id={getId(item)} justDragged={justDragged}>
              {(tile) => children(item, tile)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
