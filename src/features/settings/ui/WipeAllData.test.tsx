import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@features/settings/actions', () => ({
  wipeAllDataAction: vi.fn(() => Promise.resolve()),
}));
vi.mock('@shared/ui/toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), action: vi.fn() });
  return { toast };
});

import { WipeAllData } from './WipeAllData';
import { wipeAllDataAction } from '@features/settings/actions';
import { toast } from '@shared/ui/toast';

function stubDialog() {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}

describe('WipeAllData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDialog();
  });

  it('opens the confirm dialog on click', () => {
    render(<WipeAllData />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('open')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all data' }));
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('confirming calls the wipe action and toasts', async () => {
    render(<WipeAllData />);
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(wipeAllDataAction).toHaveBeenCalledOnce();
    await waitFor(() => expect(toast).toHaveBeenCalledWith('All data cleared'));
  });

  it('shows an error toast when the wipe fails', async () => {
    vi.mocked(wipeAllDataAction).mockRejectedValueOnce(new Error('boom'));
    render(<WipeAllData />);
    fireEvent.click(screen.getByRole('button', { name: 'Wipe all data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to wipe data — try again'),
    );
    expect(toast).not.toHaveBeenCalledWith('All data cleared');
  });
});
