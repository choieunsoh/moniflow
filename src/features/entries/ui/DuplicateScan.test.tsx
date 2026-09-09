import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

const { getBrowserDb } = vi.hoisted(() => ({ getBrowserDb: vi.fn() }));
vi.mock('@db/browser', () => ({ getBrowserDb }));

const { getEntries } = vi.hoisted(() => ({ getEntries: vi.fn() }));
vi.mock('../queries', () => ({ getEntries }));

const { deleteEntryAction, undoDeleteEntry } = vi.hoisted(() => ({
  deleteEntryAction: vi.fn(),
  undoDeleteEntry: vi.fn(),
}));
vi.mock('../actions', () => ({ deleteEntryAction, undoDeleteEntry }));

import { DuplicateScan } from './DuplicateScan';
import { getToasts, resetToasts } from '@shared/ui/toast';
import type { EntryRow } from '../schema';

function row(over: Partial<EntryRow> = {}): EntryRow {
  return {
    id: 1,
    date: '2026-07-06',
    time: null,
    accountId: 1,
    categoryId: 2,
    amount: -80,
    currency: null,
    originalAmount: null,
    note: null,
    source: 'manual',
    offBudget: null,
    category: 'Coffee',
    account: 'Cash',
    ...over,
  };
}

function clickScan(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Scan for duplicates' }));
}

describe('DuplicateScan', () => {
  beforeEach(() => {
    resetToasts();
    getBrowserDb.mockReset().mockResolvedValue({});
    getEntries.mockReset();
    deleteEntryAction.mockReset();
    undoDeleteEntry.mockReset().mockResolvedValue(undefined);
  });

  it('reads nothing until the scan button is pressed', () => {
    render(<DuplicateScan />);
    expect(screen.getByRole('button', { name: 'Scan for duplicates' })).toBeInTheDocument();
    expect(getEntries).not.toHaveBeenCalled();
    expect(screen.queryByText('No duplicates found')).not.toBeInTheDocument();
  });

  it('renders one group per duplicate set, oldest row first', async () => {
    // Cash (id 1) and Card (id 2) share date+amount+category — a duplicate pair. Transport is a
    // different category entirely, so it must not appear as a second group.
    const cash = row({ id: 1, account: 'Cash' });
    const card = row({ id: 2, account: 'Card' });
    const solo = row({ id: 3, categoryId: 9, category: 'Transport', amount: -50, account: 'Cash' });
    getEntries.mockResolvedValue([card, cash, solo]);

    render(<DuplicateScan />);
    clickScan();

    const deleteButtons = await screen.findAllByRole('button', { name: /Delete Coffee/ });
    expect(deleteButtons).toHaveLength(2);
    expect(screen.queryByText('Transport')).not.toBeInTheDocument();
    // findDuplicateGroups sorts a group ascending by id, so Cash (id 1) must render before Card (id 2)
    // even though the mocked read returned Card first.
    const bodyText = document.body.textContent ?? '';
    expect(bodyText.indexOf('Cash')).toBeLessThan(bodyText.indexOf('Card'));
  });

  it('says so when the ledger is clean', async () => {
    getEntries.mockResolvedValue([row({ id: 1 }), row({ id: 2, amount: -50 })]);
    render(<DuplicateScan />);
    clickScan();
    expect(await screen.findByText('No duplicates found')).toBeInTheDocument();
  });

  it('deletes a row through deleteEntryAction and offers Undo', async () => {
    const cash = row({ id: 1, account: 'Cash' });
    const card = row({ id: 2, account: 'Card' });
    getEntries.mockResolvedValue([cash, card]);
    deleteEntryAction.mockResolvedValue(cash);

    render(<DuplicateScan />);
    clickScan();
    const [first] = await screen.findAllByRole('button', { name: /Delete Coffee/ });

    await act(async () => {
      fireEvent.click(first);
      await Promise.resolve();
    });

    expect(deleteEntryAction).toHaveBeenCalledWith(1);
    const t = getToasts().find((x) => x.message === 'Entry deleted');
    expect(t?.action?.label).toBe('Undo');

    // Copies the exact Records-swipe pairing: the toast's own Undo button, not a second call site.
    t?.action?.onClick();
    expect(undoDeleteEntry).toHaveBeenCalledWith(cash);
  });

  it('drops a group from the list once it is down to one row', async () => {
    const cash = row({ id: 1, account: 'Cash' });
    const card = row({ id: 2, account: 'Card' });
    getEntries.mockResolvedValue([cash, card]);
    deleteEntryAction.mockResolvedValue(cash);

    render(<DuplicateScan />);
    clickScan();
    const [first] = await screen.findAllByRole('button', { name: /Delete Coffee/ });

    await act(async () => {
      fireEvent.click(first);
      await Promise.resolve();
    });

    // Down to one row for that key is no longer a duplicate — the group (and its remaining Delete
    // button) must be gone, settled from state alone, with no second call to getEntries.
    expect(screen.queryByRole('button', { name: /Delete Coffee/ })).not.toBeInTheDocument();
    expect(await screen.findByText('No duplicates found')).toBeInTheDocument();
    expect(getEntries).toHaveBeenCalledTimes(1);
  });
});
