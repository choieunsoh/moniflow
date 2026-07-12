import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DeleteAccountButton } from './DeleteAccountButton';

describe('DeleteAccountButton (two-tap arm-in-place)', () => {
  let requestSubmit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    // The armed tap submits via form.requestSubmit(); stub it so we can assert without firing the action.
    requestSubmit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts disarmed — a plain trash button, not a submit, and does nothing to the form', () => {
    render(<DeleteAccountButton account="Empty" />);
    const btn = screen.getByRole('button', { name: 'Delete Empty' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('arms on first tap (label changes to Delete) before committing', () => {
    render(<DeleteAccountButton account="Empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Empty' }));

    expect(screen.getByRole('button', { name: 'Confirm delete Empty' })).toBeTruthy();
    expect(requestSubmit).not.toHaveBeenCalled();
  });

  it('second tap submits the delete', () => {
    render(<DeleteAccountButton account="Empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Empty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Empty' }));

    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it('auto-disarms after 3s without a second tap (no accidental delete)', () => {
    vi.useFakeTimers();
    render(<DeleteAccountButton account="Empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Empty' }));
    expect(screen.getByRole('button', { name: 'Confirm delete Empty' })).toBeTruthy();

    void act(() => vi.advanceTimersByTime(3000));

    expect(screen.getByRole('button', { name: 'Delete Empty' })).toBeTruthy();
    expect(requestSubmit).not.toHaveBeenCalled();
  });
});
