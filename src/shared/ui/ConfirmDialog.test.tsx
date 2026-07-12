import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

function stubDialog() {
  // jsdom doesn't implement <dialog>'s showModal/close at runtime (only the `open` property
  // exists on HTMLDialogElement.prototype), so vi.spyOn has nothing to wrap yet — seed no-op
  // methods first (unconditionally; vi.spyOn immediately overrides them below), then mock them.
  HTMLDialogElement.prototype.showModal = function () {};
  HTMLDialogElement.prototype.close = function () {};
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
}

const baseProps = {
  open: true,
  title: 'Wipe all data?',
  body: 'Delete all entries, categories, and accounts. This cannot be undone.',
  confirmLabel: 'Delete everything',
  destructive: true,
};

describe('ConfirmDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubDialog();
  });

  it('invokes onConfirm then onClose when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Cancel closes without confirming', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking the backdrop (the dialog element itself) closes without confirming', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog', { hidden: true }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('applies destructive styling to the confirm button', () => {
    render(<ConfirmDialog {...baseProps} destructive onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete everything' }).style.background).toBe(
      'var(--color-loss)',
    );
  });

  it('opens/closes the native dialog in step with the open prop', () => {
    const { rerender } = render(
      <ConfirmDialog {...baseProps} open={false} onConfirm={() => {}} onClose={() => {}} />,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog.hasAttribute('open')).toBe(false);
    rerender(<ConfirmDialog {...baseProps} open onConfirm={() => {}} onClose={() => {}} />);
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});
