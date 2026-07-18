import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@features/entries/actions', () => ({
  importBackupAction: vi.fn(() => Promise.resolve({ imported: 3, skipped: 1 })),
}));
vi.mock('@features/settings/restore', () => ({
  restoreBackupAction: vi.fn(() => Promise.resolve({ entries: 5, categories: 2, accounts: 1 })),
}));
vi.mock('@shared/ui/toast', () => {
  const toast = Object.assign(vi.fn(), { error: vi.fn(), action: vi.fn() });
  return { toast };
});

import { ImportBackup } from './ImportBackup';
import { importBackupAction } from '@features/entries/actions';
import { restoreBackupAction } from '@features/settings/restore';
import { toast } from '@shared/ui/toast';

function stubDialog() {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
}

// A File whose .text() resolves to the given text (jsdom's File.text can be flaky — stub it explicitly).
function textFile(text: string, name: string): File {
  const file = new File([text], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(text) });
  return file;
}

const CSV =
  'date,account,category,amount,currency,converted amount,currency,description\n' +
  '15/01/2016,cash,food,-637,THB,-637,THB,lunch';

const COMBINED = JSON.stringify({
  version: 3,
  categories: [],
  accounts: [],
  recurrences: [],
  entriesCsv: CSV,
});

const CATALOG_V2 = JSON.stringify({
  version: 2,
  categories: [{ name: 'Food', emoji: '🍔', hue: 12, sortOrder: 0, archived: false }],
  accounts: [],
  recurrences: [],
});

const dialogOpen = () => screen.getByRole('dialog', { hidden: true }).hasAttribute('open');

describe('ImportBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubDialog();
  });

  it('a Monefy CSV opens the confirm dialog, then imports on confirm', async () => {
    render(<ImportBackup />);
    expect(dialogOpen()).toBe(false);
    fireEvent.change(screen.getByTestId('backup-file'), {
      target: { files: [textFile(CSV, 'x.csv')] },
    });
    await waitFor(() => expect(dialogOpen()).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(() => expect(importBackupAction).toHaveBeenCalledWith(CSV));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Restored 3 entries (1 skipped)'));
    expect(restoreBackupAction).not.toHaveBeenCalled();
  });

  it('a v3 combined backup confirms, then restores everything on confirm', async () => {
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), {
      target: { files: [textFile(COMBINED, 'backup.txt')] },
    });
    await waitFor(() => expect(dialogOpen()).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(() =>
      expect(restoreBackupAction).toHaveBeenCalledWith(
        expect.objectContaining({ version: 3, entriesCsv: CSV }),
      ),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Restored 5 entries, 2 categories & 1 accounts'),
    );
    expect(importBackupAction).not.toHaveBeenCalled();
  });

  it('a v1/v2 catalog file merges immediately with NO confirm dialog', async () => {
    vi.mocked(restoreBackupAction).mockResolvedValueOnce({
      entries: null,
      categories: 1,
      accounts: 0,
    });
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), {
      target: { files: [textFile(CATALOG_V2, 'catalog.txt')] },
    });
    await waitFor(() => expect(restoreBackupAction).toHaveBeenCalled());
    expect(dialogOpen()).toBe(false); // never gated — merge-only is non-destructive
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Restored 1 categories & 0 accounts'));
  });

  it('error-toasts an unrecognized file', async () => {
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), {
      target: { files: [textFile('just some junk', 'note.txt')] },
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't read that file — is it a moniflow backup or a Monefy CSV?",
      ),
    );
    expect(dialogOpen()).toBe(false);
  });

  it('error-toasts when the CSV import rejects', async () => {
    vi.mocked(importBackupAction).mockRejectedValueOnce(new Error('boom'));
    render(<ImportBackup />);
    fireEvent.change(screen.getByTestId('backup-file'), {
      target: { files: [textFile(CSV, 'x.csv')] },
    });
    await waitFor(() => expect(dialogOpen()).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't read that backup — is it a Monefy CSV?"),
    );
  });
});
