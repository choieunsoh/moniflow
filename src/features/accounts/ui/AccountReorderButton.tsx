'use client';

import { ReorderSheet } from '@shared/ui/ReorderSheet';
import { AccountIcon } from './AccountIcon';
import { reorderAccounts } from '../actions';

type ReorderAccount = { name: string; icon: string; hue?: number };

// Accounts-page reorder entry point: opens the shared sheet with each account as a draggable tile; a
// drop persists the new manual order via reorderAccounts (same action the keypad grid used to call).
export function AccountReorderButton({ items }: { items: ReorderAccount[] }) {
  return (
    <ReorderSheet
      id="reorder-accounts"
      title="Reorder accounts"
      items={items}
      getId={(a) => a.name}
      onReorder={(ordered) => void reorderAccounts(ordered.map((a) => a.name))}
      renderTile={(a) => (
        <>
          <AccountIcon icon={a.icon} name={a.name} size="lg" hue={a.hue} />
          <span className="line-clamp-3 w-full text-xs font-medium">{a.name}</span>
        </>
      )}
    />
  );
}
