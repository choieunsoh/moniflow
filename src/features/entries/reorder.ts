// Move the item identified by `activeId` to where `overId` sits, returning a new array (or the same
// reference for a no-op). Pure — this is the only custom reorder logic left now that dnd-kit owns the
// gesture; SortableGrid.onDragEnd hands it the active/over ids from the drop.
export function reorderByIds<T>(
  items: T[],
  getId: (item: T) => string,
  activeId: string,
  overId: string,
): T[] {
  const from = items.findIndex((i) => getId(i) === activeId);
  const to = items.findIndex((i) => getId(i) === overId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
