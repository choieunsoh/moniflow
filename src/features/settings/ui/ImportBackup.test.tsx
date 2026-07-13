import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@features/entries/actions', () => ({
  importBackupAction: vi.fn(() => Promise.resolve({ imported: 3, skipped: 1 })),
}));
vi.mock('@shared/ui/toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), action: vi.fn() });
  return { toast };
});

import { ImportBackup } from './ImportBackup';
import { importBackupAction } from '@features/entries/actions';
import { toast } from '@shared/ui/toast';

function stubDialog() {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}

// A File whose .text() resolves to the given CSV (jsdom's File.text can be flaky — stub it explicitly).
function csvFile(text: string): File {
  const file = new File([text], 'backup.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

const SAMPLE =
  'date,account,category,amount,currency,converted amount,currency,description\n' +
  '15/01/2016,cash,food,-637,THB,-637,THB,lunch';

describe('ImportBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDialog();
  });

  it('picking a file opens the confirm dialog', async () => {
    render(<ImportBackup />);
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('open')).toBe(false);
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [csvFile(SAMPLE)] } });
    await waitFor(() => expect(dialog.hasAttribute('open')).toBe(true));
  });

  it('confirming calls importBackupAction with the file text and toasts a summary', async () => {
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [csvFile(SAMPLE)] } });
    await waitFor(() =>
      expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(importBackupAction).toHaveBeenCalledWith(SAMPLE));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Restored 3 entries (1 skipped)'));
  });

  it('error-toasts when the action rejects', async () => {
    vi.mocked(importBackupAction).mockRejectedValueOnce(new Error('boom'));
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), { target: { files: [csvFile(SAMPLE)] } });
    await waitFor(() =>
      expect(screen.getByRole('dialog', { hidden: true }).hasAttribute('open')).toBe(true),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't read that backup — is it a Monefy CSV?"),
    );
  });
});
