import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(''),
}));

const { deleteEntryAction, undoDeleteEntry } = vi.hoisted(() => ({
  deleteEntryAction: vi.fn(),
  undoDeleteEntry: vi.fn(),
}));
vi.mock('../actions', () => ({ deleteEntryAction, undoDeleteEntry }));

import { SwipeRow } from './SwipeRow';
import { CategoryPickerProvider } from '@features/categories/ui/CategoryPicker';
import { getToasts, resetToasts } from '@shared/ui/toast';
import type { Entry, EntryRow } from '../schema';

const snapshot: Entry = {
  id: 7,
  date: '2026-07-06',
  time: '08:15',
  accountId: 1,
  categoryId: 2,
  amount: -80,
  currency: null,
  originalAmount: null,
  note: 'morning latte',
  source: 'manual',
  offBudget: null,
};
const entry: EntryRow = { ...snapshot, category: 'Coffee', account: 'Cash' };

const row = () =>
  render(
    <CategoryPickerProvider iconSet="emoji">
      <ul>
        <SwipeRow entry={entry} emoji="☕" iconSet="emoji" dateLabel="6 Jul" />
      </ul>
    </CategoryPickerProvider>,
  );

const clickDelete = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Delete Coffee' }));
    // Let remove() run through the awaited action so the toast is pushed before we assert.
    await Promise.resolve();
  });
};

// The ledger lives only in this browser's OPFS and Delete sits under a one-finger swipe, so a stray
// gesture is the app's cheapest way to lose a row for good. Every delete must therefore come back.
describe('SwipeRow delete', () => {
  beforeEach(() => {
    resetToasts();
    deleteEntryAction.mockReset().mockResolvedValue(snapshot);
    undoDeleteEntry.mockReset().mockResolvedValue(undefined);
  });

  it('offers Undo on the confirmation toast', async () => {
    row();
    await clickDelete();
    const toast = getToasts().find((t) => t.message === 'Entry deleted');
    expect(toast?.action?.label).toBe('Undo');
  });

  it('restores the deleted row from its snapshot when Undo is pressed', async () => {
    row();
    await clickDelete();
    const toast = getToasts().find((t) => t.message === 'Entry deleted');
    await act(async () => {
      toast?.action?.onClick();
      await Promise.resolve();
    });
    expect(undoDeleteEntry).toHaveBeenCalledWith(snapshot);
  });

  // A row already deleted in another view leaves nothing to put back — an Undo that silently does
  // nothing is worse than no Undo at all.
  it('offers no Undo when the row was already gone', async () => {
    deleteEntryAction.mockResolvedValue(undefined);
    row();
    await clickDelete();
    expect(getToasts().find((t) => t.message === 'Entry deleted')?.action).toBeUndefined();
  });
});
