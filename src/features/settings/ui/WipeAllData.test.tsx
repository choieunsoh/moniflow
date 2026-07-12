import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@features/settings/actions', () => ({
  wipeAllDataAction: vi.fn(() => Promise.resolve()),
}));
vi.mock('@shared/ui/toast', () => ({ toast: vi.fn() }));

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
  vi.spyOn(HTMLDialogElement.prototype, 'showModal');
  vi.spyOn(HTMLDialogElement.prototype, 'close');
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
    await Promise.resolve(); // let the awaited action settle before the toast fires
    expect(toast).toHaveBeenCalledWith('All data cleared');
  });
});
