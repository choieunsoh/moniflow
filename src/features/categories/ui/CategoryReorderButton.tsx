'use client';

import { ReorderSheet } from '@shared/ui/ReorderSheet';
import { CategoryIcon } from './CategoryIcon';
import { reorderCategories } from '../actions';
import type { IconSet } from '@features/settings/queries';

type ReorderCategory = { name: string; emoji: string; hue?: number };

// Categories-page reorder entry point: opens the shared sheet with each category as a draggable tile;
// a drop persists the new manual order via reorderCategories (same action the keypad grid used to call).
export function CategoryReorderButton({
  items,
  iconSet,
}: {
  items: ReorderCategory[];
  iconSet: IconSet;
}) {
  return (
    <ReorderSheet
      id="reorder-categories"
      title="Reorder categories"
      items={items}
      getId={(c) => c.name}
      onReorder={(ordered) => void reorderCategories(ordered.map((c) => c.name))}
      renderTile={(c) => (
        <>
          <CategoryIcon emoji={c.emoji} name={c.name} size="lg" iconSet={iconSet} hue={c.hue} />
          <span className="w-full truncate text-xs" style={{ color: 'var(--color-muted)' }}>
            {c.name}
          </span>
        </>
      )}
    />
  );
}
